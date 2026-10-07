//! Run the Aily startup reporter as a one-shot launchd job. Double-forking or
//! detaching a child does not detach macOS privacy responsibility from our app.
//! Only this startup boundary moves: ordinary OneTouch controls keep their owner.

use super::{capture_command_with_timeout, ProcessCapture};
use std::{
    collections::BTreeMap,
    env, fs,
    os::unix::fs::{DirBuilderExt, OpenOptionsExt},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::atomic::{AtomicU64, Ordering},
    thread,
    time::{Duration, Instant},
};

static NEXT_JOB: AtomicU64 = AtomicU64::new(0);
const LAUNCHCTL_TIMEOUT: Duration = Duration::from_secs(3);
// All paths, environment values and CLI arguments are positional arguments;
// nothing supplied by the caller is interpolated into shell source.
const REPORT_EXIT: &str =
    "exit_file=$1; shift; \"$@\" </dev/null; result=$?; printf '%s\\n' \"$result\" > \"$exit_file\"; exit \"$result\"";

fn launchctl() -> Command {
    let mut command = Command::new("/bin/launchctl");
    command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    command
}

struct Job {
    directory: PathBuf,
    domain: String,
    label: String,
    loaded: bool,
}

impl Job {
    fn new() -> Result<Self, String> {
        let uid = super::read_process("/usr/bin/id", &["-u"])
            .and_then(|value| value.parse::<u32>().ok())
            .ok_or("Unable to identify the macOS login session")?;
        let label = format!(
            "design.ryan.onetouch.aily-start.{}.{}",
            std::process::id(),
            NEXT_JOB.fetch_add(1, Ordering::Relaxed)
        );
        let directory = env::temp_dir().join(&label);
        // Never reuse an existing directory, including one left by a crashed
        // process with the same PID. Other users cannot read the environment.
        fs::DirBuilder::new()
            .mode(0o700)
            .create(&directory)
            .map_err(|error| format!("Unable to prepare Aily startup: {error}"))?;
        Ok(Self {
            directory,
            domain: format!("gui/{uid}"),
            label,
            loaded: false,
        })
    }

    fn unload(&mut self) -> Result<(), String> {
        if !self.loaded {
            return Ok(());
        }
        let target = format!("{}/{}", self.domain, self.label);
        let mut command = launchctl();
        command.args(["bootout", &target]);
        let result = capture_command_with_timeout(command, LAUNCHCTL_TIMEOUT)?;
        if result.code != 0 {
            return Err(format!(
                "Unable to finish Aily startup job: {}",
                result.stderr
            ));
        }
        self.loaded = false;
        Ok(())
    }
}

impl Drop for Job {
    fn drop(&mut self) {
        // Aily deliberately outlives its reporter and OneTouch. The job sets
        // AbandonProcessGroup so unloading it cannot kill the detached daemon.
        if let Err(error) = self.unload() {
            eprintln!("{error}");
        }
        let _ = fs::remove_dir_all(&self.directory);
    }
}

fn text(value: &std::ffi::OsStr) -> Result<String, String> {
    value
        .to_str()
        .map(str::to_owned)
        .ok_or_else(|| "Aily startup contains a non-UTF-8 path or environment value".into())
}

fn definition(command: &Command, job: &Job) -> Result<plist::Value, String> {
    let mut environment: BTreeMap<_, _> = env::vars_os().collect();
    for (key, value) in command.get_envs() {
        if let Some(value) = value {
            environment.insert(key.to_owned(), value.to_owned());
        } else {
            environment.remove(key);
        }
    }
    // env -i prevents launchd's own environment from restoring stripped Aily
    // agent/session variables. Preserve exactly the prepared CLI environment.
    let mut arguments = vec![
        "/bin/sh".to_string(),
        "-c".into(),
        REPORT_EXIT.into(),
        "onetouch-aily-start".into(),
        text(job.directory.join("exit").as_os_str())?,
        "/usr/bin/env".into(),
        "-i".into(),
    ];
    for (key, value) in environment {
        arguments.push(format!("{}={}", text(&key)?, text(&value)?));
    }
    arguments.push(text(command.get_program())?);
    for argument in command.get_args() {
        arguments.push(text(argument)?);
    }
    let mut dict = plist::Dictionary::new();
    dict.insert("Label".into(), job.label.clone().into());
    dict.insert(
        "ProgramArguments".into(),
        plist::Value::Array(arguments.into_iter().map(plist::Value::String).collect()),
    );
    dict.insert("RunAtLoad".into(), true.into());
    dict.insert("KeepAlive".into(), false.into());
    dict.insert("AbandonProcessGroup".into(), true.into());
    dict.insert("ExitTimeOut".into(), 1u64.into());
    for (key, file) in [
        ("StandardOutPath", "stdout"),
        ("StandardErrorPath", "stderr"),
    ] {
        dict.insert(
            key.into(),
            text(job.directory.join(file).as_os_str())?.into(),
        );
    }
    if let Some(directory) = command.get_current_dir() {
        dict.insert(
            "WorkingDirectory".into(),
            text(directory.as_os_str())?.into(),
        );
    }
    Ok(plist::Value::Dictionary(dict))
}

fn read_output(path: &Path) -> Result<String, String> {
    fs::read(path)
        .map(|bytes| String::from_utf8_lossy(&bytes).trim().to_string())
        .map_err(|error| format!("Unable to read Aily startup result: {error}"))
}

pub(super) fn run(command: Command, timeout: Duration) -> Result<ProcessCapture, String> {
    let mut job = Job::new()?;
    let path = job.directory.join("job.plist");
    let file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o600)
        .open(&path)
        .map_err(|error| format!("Unable to write Aily startup job: {error}"))?;
    definition(&command, &job)?
        .to_writer_xml(file)
        .map_err(|error| format!("Unable to encode Aily startup job: {error}"))?;
    let mut bootstrap = launchctl();
    bootstrap.args(["bootstrap", &job.domain]).arg(&path);
    // Mark before submitting so timeout/error paths also attempt to remove the
    // unique job. Do not fall back to spawning the daemon under OneTouch.
    job.loaded = true;
    let result = capture_command_with_timeout(bootstrap, LAUNCHCTL_TIMEOUT)?;
    let _ = fs::remove_file(&path);
    if result.code != 0 {
        return Err(format!(
            "macOS could not start the Aily job: {}",
            result.stderr
        ));
    }
    let started = Instant::now();
    let exit_path = job.directory.join("exit");
    loop {
        if let Ok(exit) = fs::read_to_string(&exit_path) {
            // A short empty read can race with the shell opening the marker.
            if let Ok(code) = exit.trim().parse::<i32>() {
                let capture = ProcessCapture {
                    code,
                    stdout: read_output(&job.directory.join("stdout"))?,
                    stderr: read_output(&job.directory.join("stderr"))?,
                };
                job.unload()?;
                return Ok(capture);
            }
        }
        if started.elapsed() >= timeout {
            return Err(format!(
                "aily-cli did not respond within {:.0} seconds.",
                timeout.as_secs_f64()
            ));
        }
        thread::sleep(Duration::from_millis(50));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn launchd_preserves_literal_arguments_environment_and_failure_output() {
        let mut command = Command::new("/bin/sh");
        command
            .args([
                "-c",
                "printf '%s' \"$1\"; printf '%s' \"$ONETOUCH_LAUNCH_TEST\" >&2; exit 7",
                "probe",
                "$(touch /tmp/onetouch-unwanted) '\" & < >",
            ])
            .env(
                "ONETOUCH_LAUNCH_TEST",
                "a value with spaces and $shell syntax",
            );
        let capture = run(command, Duration::from_secs(5)).unwrap();
        assert_eq!(capture.code, 7);
        assert_eq!(capture.stdout, "$(touch /tmp/onetouch-unwanted) '\" & < >");
        assert_eq!(capture.stderr, "a value with spaces and $shell syntax");
    }

    #[test]
    fn launchd_timeout_unloads_the_unique_job() {
        let mut command = Command::new("/bin/sleep");
        command.arg("1");
        let result = run(command, Duration::from_millis(100));
        assert!(matches!(result, Err(error) if error.contains("did not respond")));
    }

    #[test]
    fn unloading_the_reporter_preserves_its_background_service() {
        let evidence = Job::new().unwrap();
        let marker = evidence.directory.join("survived");
        let mut command = Command::new("/bin/sh");
        command
            .args(["-c", "(sleep 0.4; printf survived > \"$1\") &", "probe"])
            .arg(&marker);
        let capture = run(command, Duration::from_secs(5)).unwrap();
        assert_eq!(capture.code, 0);
        let deadline = Instant::now() + Duration::from_secs(2);
        while !marker.exists() && Instant::now() < deadline {
            thread::sleep(Duration::from_millis(50));
        }
        assert_eq!(fs::read_to_string(marker).unwrap(), "survived");
    }

    #[test]
    fn the_job_keeps_cli_overrides_and_removals_in_a_private_directory() {
        use std::os::unix::fs::PermissionsExt;
        let job = Job::new().unwrap();
        let mut command = Command::new("/usr/bin/true");
        command.env("AILY_CLI_DAEMON_READY_WAIT_MS", "20000");
        command.env_remove("HOME");
        let definition = definition(&command, &job).unwrap();
        let arguments = definition.as_dictionary().unwrap()["ProgramArguments"]
            .as_array()
            .unwrap();
        assert!(arguments.iter().any(|argument| {
            argument.as_string() == Some("AILY_CLI_DAEMON_READY_WAIT_MS=20000")
        }));
        assert!(!arguments.iter().any(|argument| {
            argument
                .as_string()
                .is_some_and(|value| value.starts_with("HOME="))
        }));
        assert_eq!(
            fs::metadata(&job.directory).unwrap().permissions().mode() & 0o777,
            0o700
        );
    }

    #[test]
    fn launchd_starts_a_process_with_its_own_privacy_responsibility() {
        let mut command = Command::new(env::current_exe().unwrap());
        command.args([
            "--exact",
            "launchd_command::tests::responsibility_probe",
            "--ignored",
            "--nocapture",
        ]);
        let capture = run(command, Duration::from_secs(5)).unwrap();
        assert_eq!(capture.code, 0, "{}", capture.stderr);
        assert!(capture.stdout.contains("responsibility-probe-passed"));
    }

    #[test]
    #[ignore = "run only as a child of the launchd responsibility test"]
    fn responsibility_probe() {
        // Diagnostic-only SPI, never linked into the production app. Verify the
        // kernel attribution rather than inferring it from PPID=1 or a successful
        // launchctl call; neither alone proves privacy responsibility.
        unsafe extern "C" {
            fn responsibility_get_pid_responsible_for_pid(pid: i32) -> i32;
        }
        let pid = std::process::id() as i32;
        assert_eq!(
            unsafe { responsibility_get_pid_responsible_for_pid(pid) },
            pid
        );
        println!("responsibility-probe-passed");
    }
}
