#import <AppKit/AppKit.h>
#import <ApplicationServices/ApplicationServices.h>
#import <IOBluetooth/IOBluetooth.h>
#import <Intents/Intents.h>
#import <objc/message.h>
#import <objc/runtime.h>

#include <dlfcn.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

static NSMutableArray<NSWindow *> *SBCleanWindows;
static BOOL SBCleanActive = NO;
static id SBCleanLocalKeyMonitor;
static id SBCleanGlobalKeyMonitor;
static NSUInteger SBCleanEscapeGeneration = 0;
static BOOL SBCleanEscapeHeld = NO;
static CFMachPortRef SBCleanKeyboardTap = NULL;
static CFRunLoopSourceRef SBCleanKeyboardTapSource = NULL;
static CFRunLoopRef SBCleanKeyboardRunLoop = NULL;
static dispatch_source_t SBCleanEscapePollTimer;
static CFAbsoluteTime SBCleanEscapePressedAt = 0;
static CFMachPortRef SBKeyboardTap = NULL;
static CFRunLoopSourceRef SBKeyboardTapSource = NULL;
static CFRunLoopRef SBKeyboardRunLoop = NULL;
static BOOL SBKeyboardActive = NO;

typedef void (*SBStatusItemCallback)(double x, double y, double width, double height);
static __strong NSStatusItem *SBStatusItem;
static __strong NSObject *SBStatusTargetInstance;
static SBStatusItemCallback SBStatusCallback = NULL;

typedef struct {
    int available;
    int state_known;
    int enabled;
} SBFeatureStatus;

typedef struct { int hour; int minute; } SBBlueLightTime;
typedef struct { SBBlueLightTime from; SBBlueLightTime to; } SBBlueLightSchedule;
typedef struct {
    BOOL active;
    BOOL enabled;
    BOOL sunSchedulePermitted;
    int mode;
    SBBlueLightSchedule schedule;
    uint64_t disableFlags;
    BOOL available;
} SBBlueLightStatus;

static void SBRunOnMainSync(dispatch_block_t block);
static void SBCopyError(char **output, NSString *message);
static int SBSetControlCenterCheckbox(NSString *menuIdentifier, NSString *checkboxIdentifier,
                                      BOOL enabled, BOOL *actualState, char **error_output);

@interface SBStatusTarget : NSObject
@end

static NSImage *SBSwitchStatusImage(void) {
    NSImage *image = [[NSImage alloc] initWithSize:NSMakeSize(18.0, 18.0)];
    [image lockFocus];
    NSGraphicsContext.currentContext.shouldAntialias = YES;

    NSColor *iconColor = NSColor.whiteColor;
    [iconColor setStroke];
    [iconColor setFill];

    NSBezierPath *track =
        [NSBezierPath bezierPathWithRoundedRect:NSMakeRect(1.0, 4.5, 16.0, 9.0)
                                        xRadius:4.5
                                        yRadius:4.5];
    track.lineWidth = 1.5;
    [track stroke];

    NSBezierPath *knob =
        [NSBezierPath bezierPathWithOvalInRect:NSMakeRect(9.25, 5.75, 6.5, 6.5)];
    [knob fill];

    [image unlockFocus];
    // Keep the authored white pixels. NSStatusItem can resolve template images
    // against the application's appearance instead of the actual menu-bar
    // background, which made this icon render black on a dark menu bar.
    image.template = NO;
    return image;
}

static NSImage *SBStatusImage(NSString *kind) {
    if (@available(macOS 11.0, *)) {
        NSString *symbolName = nil;
        if ([kind isEqualToString:@"dots"]) symbolName = @"square.grid.2x2";
        if ([kind isEqualToString:@"bolt"]) symbolName = @"bolt";
        if (symbolName != nil) {
            NSImage *symbol =
                [NSImage imageWithSystemSymbolName:symbolName
                          accessibilityDescription:@"OneTouch"];
            NSImageSymbolConfiguration *configuration =
                [NSImageSymbolConfiguration configurationWithPointSize:15.0
                                                                weight:NSFontWeightMedium];
            symbol = [symbol imageWithSymbolConfiguration:configuration];
            symbol.template = YES;
            return symbol;
        }
    }
    return SBSwitchStatusImage();
}

static void SBUpdateStatusImage(NSString *kind) {
    if (SBStatusItem.button == nil) return;
    SBStatusItem.button.title = @"";
    SBStatusItem.button.attributedTitle = [[NSAttributedString alloc] initWithString:@""];
    SBStatusItem.button.image = SBStatusImage(kind ?: @"switch");
    SBStatusItem.button.imagePosition = NSImageOnly;
    SBStatusItem.button.imageScaling = NSImageScaleNone;
    SBStatusItem.button.contentTintColor = NSColor.whiteColor;
    SBStatusItem.button.accessibilityLabel = @"OneTouch";
}

@implementation SBStatusTarget
- (void)clicked:(id)sender {
    if (SBStatusCallback == NULL || SBStatusItem.button.window == nil) return;
    NSButton *button = SBStatusItem.button;
    NSRect frame = [button.window convertRectToScreen:button.frame];
    NSScreen *screen = button.window.screen ?: NSScreen.mainScreen;
    NSRect screenFrame = screen.frame;
    double flippedY = screenFrame.origin.y + screenFrame.size.height - (frame.origin.y + frame.size.height);
    SBStatusCallback(frame.origin.x, flippedY, frame.size.width, frame.size.height);
}
@end

int sb_status_item_create(SBStatusItemCallback callback) {
    __block int result = 0;
    SBRunOnMainSync(^{
        SBStatusCallback = callback;
        if (SBStatusItem == nil) {
            SBStatusTargetInstance = [SBStatusTarget new];
            SBStatusItem = [NSStatusBar.systemStatusBar statusItemWithLength:22.0];
        }
        if (SBStatusItem.button == nil) {
            result = -1;
            return;
        }
        // AppKit persists visibility by autosave name. Older builds briefly
        // hid their tray item during startup, which can leave the automatically
        // assigned "Item-N" entry permanently hidden. Reset that automatic
        // identity, give this indispensable item a stable identity, and make
        // its visibility explicit.
        SBStatusItem.autosaveName = nil;
        SBStatusItem.autosaveName = @"design.ryan.switchboard.primary-status-item.v3";
        SBStatusItem.behavior = 0;
        SBStatusItem.visible = YES;
        SBStatusItem.length = NSVariableStatusItemLength;
        SBStatusItem.button.target = SBStatusTargetInstance;
        SBStatusItem.button.action = @selector(clicked:);
        SBStatusItem.button.toolTip = @"OneTouch";
        SBStatusItem.button.enabled = YES;
        SBStatusItem.button.hidden = NO;
        SBStatusItem.button.alphaValue = 1.0;
        [SBStatusItem.button sendActionOn:NSEventMaskLeftMouseUp];
        SBUpdateStatusImage(@"switch");
    });
    return result;
}

int sb_status_item_set_icon_kind(const char *kind) {
    NSString *value = kind == NULL ? @"switch" : [NSString stringWithUTF8String:kind];
    SBRunOnMainSync(^{
        SBStatusItem.visible = YES;
        SBUpdateStatusImage(value);
    });
    return 0;
}

int sb_status_item_is_visible(void) {
    __block int visible = 0;
    SBRunOnMainSync(^{
        visible = SBStatusItem != nil && SBStatusItem.isVisible &&
                  SBStatusItem.button != nil && !SBStatusItem.button.isHidden &&
                  SBStatusItem.button.alphaValue > 0.0;
    });
    return visible;
}

static NSDictionary<NSNumber *, NSString *> *SBDisplayNames(void) {
    // Command-line test binaries do not run an AppKit event loop. Avoid
    // synchronously waiting on their main queue; the Core Graphics fallback
    // names remain sufficient there.
    if (NSApp == nil) return @{};

    __block NSMutableDictionary<NSNumber *, NSString *> *names = [NSMutableDictionary dictionary];
    SBRunOnMainSync(^{
        for (NSScreen *screen in NSScreen.screens) {
            NSNumber *screenNumber = screen.deviceDescription[@"NSScreenNumber"];
            if (screenNumber == nil) continue;
            NSString *name = nil;
            if (@available(macOS 10.15, *)) {
                name = screen.localizedName;
            }
            if (name.length > 0) names[screenNumber] = name;
        }
    });
    return names;
}

static NSDictionary *SBDisplayModeDictionary(CGDisplayModeRef mode, CGDisplayModeRef current) {
    size_t width = CGDisplayModeGetWidth(mode);
    size_t height = CGDisplayModeGetHeight(mode);
    size_t pixelWidth = CGDisplayModeGetPixelWidth(mode);
    size_t pixelHeight = CGDisplayModeGetPixelHeight(mode);
    double refreshRate = CGDisplayModeGetRefreshRate(mode);
    BOOL isCurrent =
        current != NULL &&
        CGDisplayModeGetIODisplayModeID(mode) == CGDisplayModeGetIODisplayModeID(current) &&
        width == CGDisplayModeGetWidth(current) &&
        height == CGDisplayModeGetHeight(current) &&
        pixelWidth == CGDisplayModeGetPixelWidth(current) &&
        pixelHeight == CGDisplayModeGetPixelHeight(current);

    return @{
        @"id": @(CGDisplayModeGetIODisplayModeID(mode)),
        @"width": @(width),
        @"height": @(height),
        @"pixelWidth": @(pixelWidth),
        @"pixelHeight": @(pixelHeight),
        @"refreshRate": @(refreshRate),
        @"hiDpi": @((BOOL)((pixelWidth > width) || (pixelHeight > height))),
        @"current": @(isCurrent),
    };
}

static BOOL SBPreferDisplayMode(NSDictionary *candidate, NSDictionary *existing) {
    if ([candidate[@"current"] boolValue] != [existing[@"current"] boolValue]) {
        return [candidate[@"current"] boolValue];
    }
    if ([candidate[@"hiDpi"] boolValue] != [existing[@"hiDpi"] boolValue]) {
        return [candidate[@"hiDpi"] boolValue];
    }
    unsigned long long candidatePixels =
        [candidate[@"pixelWidth"] unsignedLongLongValue] *
        [candidate[@"pixelHeight"] unsignedLongLongValue];
    unsigned long long existingPixels =
        [existing[@"pixelWidth"] unsignedLongLongValue] *
        [existing[@"pixelHeight"] unsignedLongLongValue];
    if (candidatePixels != existingPixels) return candidatePixels > existingPixels;
    return [candidate[@"refreshRate"] doubleValue] > [existing[@"refreshRate"] doubleValue];
}

char *sb_display_configuration_json(void) {
    @autoreleasepool {
        CGDirectDisplayID displayIDs[32] = {0};
        CGDisplayCount displayCount = 0;
        CGError listResult = CGGetActiveDisplayList(32, displayIDs, &displayCount);
        if (listResult != kCGErrorSuccess) return NULL;

        NSDictionary<NSNumber *, NSString *> *names = SBDisplayNames();
        NSMutableArray *displays = [NSMutableArray arrayWithCapacity:displayCount];

        for (CGDisplayCount index = 0; index < displayCount; index++) {
            CGDirectDisplayID displayID = displayIDs[index];
            CGDisplayModeRef current = CGDisplayCopyDisplayMode(displayID);
            if (current == NULL) continue;

            CFArrayRef availableRef = CGDisplayCopyAllDisplayModes(displayID, NULL);
            NSArray *available = CFBridgingRelease(availableRef);
            NSMutableDictionary<NSString *, NSDictionary *> *preferredModes =
                [NSMutableDictionary dictionary];

            for (id value in available ?: @[]) {
                CGDisplayModeRef mode = (__bridge CGDisplayModeRef)value;
                if (!CGDisplayModeIsUsableForDesktopGUI(mode)) continue;
                size_t width = CGDisplayModeGetWidth(mode);
                size_t height = CGDisplayModeGetHeight(mode);
                if (width == 0 || height == 0) continue;

                NSDictionary *candidate = SBDisplayModeDictionary(mode, current);
                NSString *key = [NSString stringWithFormat:@"%zux%zu", width, height];
                NSDictionary *existing = preferredModes[key];
                if (existing == nil || SBPreferDisplayMode(candidate, existing)) {
                    preferredModes[key] = candidate;
                }
            }

            NSDictionary *currentDictionary = SBDisplayModeDictionary(current, current);
            NSString *currentKey = [NSString stringWithFormat:@"%@x%@",
                                    currentDictionary[@"width"], currentDictionary[@"height"]];
            preferredModes[currentKey] = currentDictionary;

            NSArray *modes = [preferredModes.allValues sortedArrayUsingComparator:
                ^NSComparisonResult(NSDictionary *first, NSDictionary *second) {
                    NSInteger firstWidth = [first[@"width"] integerValue];
                    NSInteger secondWidth = [second[@"width"] integerValue];
                    if (firstWidth != secondWidth) {
                        return firstWidth < secondWidth ? NSOrderedAscending : NSOrderedDescending;
                    }
                    NSInteger firstHeight = [first[@"height"] integerValue];
                    NSInteger secondHeight = [second[@"height"] integerValue];
                    if (firstHeight == secondHeight) return NSOrderedSame;
                    return firstHeight < secondHeight ? NSOrderedAscending : NSOrderedDescending;
                }];

            NSNumber *displayNumber = @(displayID);
            NSString *fallbackName = CGDisplayIsBuiltin(displayID)
                ? @"Built-in Display"
                : [NSString stringWithFormat:@"Display %u", displayID];
            [displays addObject:@{
                @"id": displayNumber,
                @"name": names[displayNumber] ?: fallbackName,
                @"main": @((BOOL)CGDisplayIsMain(displayID)),
                @"builtIn": @((BOOL)CGDisplayIsBuiltin(displayID)),
                @"currentModeId": currentDictionary[@"id"],
                @"currentWidth": currentDictionary[@"width"],
                @"currentHeight": currentDictionary[@"height"],
                @"modes": modes,
            }];
            CGDisplayModeRelease(current);
        }

        [displays sortUsingComparator:^NSComparisonResult(NSDictionary *first, NSDictionary *second) {
            if ([first[@"main"] boolValue] != [second[@"main"] boolValue]) {
                return [first[@"main"] boolValue] ? NSOrderedAscending : NSOrderedDescending;
            }
            return [first[@"name"] localizedCaseInsensitiveCompare:second[@"name"]];
        }];

        NSData *data = [NSJSONSerialization dataWithJSONObject:@{@"displays": displays}
                                                       options:0
                                                         error:nil];
        if (data == nil) return NULL;
        NSString *json = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
        return strdup(json.UTF8String ?: "{\"displays\":[]}");
    }
}

int sb_display_set_mode(uint32_t display_id, int32_t mode_id, char **error_output) {
    @autoreleasepool {
        CGDirectDisplayID displayID = (CGDirectDisplayID)display_id;
        if (!CGDisplayIsActive(displayID)) {
            SBCopyError(error_output, @"The selected display is no longer connected");
            return -1;
        }

        CFArrayRef availableRef = CGDisplayCopyAllDisplayModes(displayID, NULL);
        NSArray *available = CFBridgingRelease(availableRef);
        CGDisplayModeRef selected = NULL;
        for (id value in available ?: @[]) {
            CGDisplayModeRef mode = (__bridge CGDisplayModeRef)value;
            if (CGDisplayModeGetIODisplayModeID(mode) == mode_id &&
                CGDisplayModeIsUsableForDesktopGUI(mode)) {
                selected = mode;
                break;
            }
        }
        if (selected == NULL) {
            SBCopyError(error_output, @"The selected resolution is no longer available");
            return -1;
        }

        size_t requestedWidth = CGDisplayModeGetWidth(selected);
        size_t requestedHeight = CGDisplayModeGetHeight(selected);
        CGDisplayConfigRef configuration = NULL;
        CGError result = CGBeginDisplayConfiguration(&configuration);
        if (result != kCGErrorSuccess || configuration == NULL) {
            SBCopyError(error_output, @"macOS could not begin the display change");
            return -1;
        }

        result = CGConfigureDisplayWithDisplayMode(configuration, displayID, selected, NULL);
        if (result != kCGErrorSuccess) {
            CGCancelDisplayConfiguration(configuration);
            SBCopyError(error_output, @"macOS rejected the selected resolution");
            return -1;
        }

        result = CGCompleteDisplayConfiguration(configuration, kCGConfigurePermanently);
        if (result != kCGErrorSuccess) {
            SBCopyError(error_output, @"macOS could not save the selected resolution");
            return -1;
        }

        usleep(180000);
        CGDisplayModeRef current = CGDisplayCopyDisplayMode(displayID);
        BOOL applied = current != NULL &&
                       CGDisplayModeGetWidth(current) == requestedWidth &&
                       CGDisplayModeGetHeight(current) == requestedHeight;
        if (current != NULL) CGDisplayModeRelease(current);
        if (!applied) {
            SBCopyError(error_output, @"The display did not reach the selected resolution");
            return -1;
        }
        return 0;
    }
}

static void SBCopyError(char **output, NSString *message) {
    if (output == NULL) return;
    if (*output != NULL) free(*output);
    *output = strdup(message.UTF8String ?: "Unknown macOS error");
}

static void SBResetFeatureStatus(SBFeatureStatus *status) {
    if (status != NULL) memset(status, 0, sizeof(*status));
}

static void SBWriteFeatureStatus(SBFeatureStatus *status, BOOL available, BOOL known, BOOL enabled) {
    if (status == NULL) return;
    status->available = available ? 1 : 0;
    status->state_known = known ? 1 : 0;
    status->enabled = enabled ? 1 : 0;
}

static BOOL SBHasFocusUsageDescription(void) {
    id value = [NSBundle.mainBundle objectForInfoDictionaryKey:@"NSFocusStatusUsageDescription"];
    return [value isKindOfClass:NSString.class] && ((NSString *)value).length > 0;
}

static BOOL SBLoadPrivateFramework(NSString *name) {
    static NSMutableDictionary<NSString *, NSNumber *> *results;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{ results = [NSMutableDictionary dictionary]; });
    @synchronized (results) {
        NSNumber *cached = results[name];
        if (cached != nil) return cached.boolValue;
        NSString *path = [NSString stringWithFormat:@"/System/Library/PrivateFrameworks/%@.framework/%@", name, name];
        BOOL loaded = dlopen(path.fileSystemRepresentation, RTLD_LAZY | RTLD_LOCAL) != NULL;
        results[name] = @(loaded);
        return loaded;
    }
}

static id SBNewRuntimeClient(NSString *framework, NSString *className, char **error_output) {
    if (!SBLoadPrivateFramework(framework)) {
        SBCopyError(error_output, [NSString stringWithFormat:@"%@ is unavailable on this macOS version", framework]);
        return nil;
    }
    Class clientClass = NSClassFromString(className);
    if (clientClass == Nil) {
        SBCopyError(error_output, [NSString stringWithFormat:@"%@ is unavailable on this macOS version", className]);
        return nil;
    }
    return [[clientClass alloc] init];
}

int sb_night_shift_get(SBFeatureStatus *status, char **error_output) {
    @autoreleasepool {
        SBResetFeatureStatus(status);
        id client = SBNewRuntimeClient(@"CoreBrightness", @"CBBlueLightClient", error_output);
        if (client == nil) return -1;
        SEL supportedSelector = sel_registerName("supported");
        SEL statusSelector = sel_registerName("getBlueLightStatus:");
        if (![client respondsToSelector:supportedSelector] || ![client respondsToSelector:statusSelector]) {
            SBCopyError(error_output, @"Night Shift is not supported by this macOS version");
            return -1;
        }
        BOOL supported = ((BOOL (*)(id, SEL))objc_msgSend)(client, supportedSelector);
        if (!supported) {
            SBWriteFeatureStatus(status, NO, YES, NO);
            SBCopyError(error_output, @"Night Shift is not supported by the active display");
            return 0;
        }
        SBBlueLightStatus blueLight = {0};
        BOOL read = ((BOOL (*)(id, SEL, SBBlueLightStatus *))objc_msgSend)(client, statusSelector, &blueLight);
        if (!read) {
            SBWriteFeatureStatus(status, YES, NO, NO);
            SBCopyError(error_output, @"macOS could not read the Night Shift state");
            return -1;
        }
        SBWriteFeatureStatus(status, blueLight.available, YES, blueLight.enabled);
        if (!blueLight.available) SBCopyError(error_output, @"Night Shift is unavailable for the active display");
        return 0;
    }
}

int sb_night_shift_set(int enabled, SBFeatureStatus *status, char **error_output) {
    @autoreleasepool {
        SBFeatureStatus before = {0};
        int readResult = sb_night_shift_get(&before, error_output);
        if (readResult != 0 || !before.available) {
            if (status != NULL) *status = before;
            return readResult == 0 ? -1 : readResult;
        }
        id client = SBNewRuntimeClient(@"CoreBrightness", @"CBBlueLightClient", error_output);
        SEL selector = sel_registerName("setEnabled:");
        if (client == nil || ![client respondsToSelector:selector]) {
            SBCopyError(error_output, @"Night Shift cannot be changed on this macOS version");
            return -1;
        }
        BOOL wrote = ((BOOL (*)(id, SEL, BOOL))objc_msgSend)(client, selector, enabled != 0);
        if (!wrote) {
            SBCopyError(error_output, @"macOS rejected the Night Shift change");
            return -1;
        }
        usleep(120000);
        int result = sb_night_shift_get(status, error_output);
        if (result == 0 && status != NULL && status->enabled != (enabled != 0)) {
            SBCopyError(error_output, @"Night Shift did not reach the requested state");
            return -1;
        }
        return result;
    }
}

int sb_true_tone_get(SBFeatureStatus *status, char **error_output) {
    @autoreleasepool {
        SBResetFeatureStatus(status);
        id client = SBNewRuntimeClient(@"CoreBrightness", @"CBTrueToneClient", error_output);
        if (client == nil) return -1;
        SEL supportedSelector = sel_registerName("supported");
        SEL availableSelector = sel_registerName("available");
        SEL enabledSelector = sel_registerName("enabled");
        if (![client respondsToSelector:supportedSelector] || ![client respondsToSelector:availableSelector] ||
            ![client respondsToSelector:enabledSelector]) {
            SBCopyError(error_output, @"True Tone is not supported by this macOS version");
            return -1;
        }
        BOOL supported = ((BOOL (*)(id, SEL))objc_msgSend)(client, supportedSelector);
        BOOL available = supported && ((BOOL (*)(id, SEL))objc_msgSend)(client, availableSelector);
        BOOL enabled = available && ((BOOL (*)(id, SEL))objc_msgSend)(client, enabledSelector);
        SBWriteFeatureStatus(status, available, YES, enabled);
        if (!available) SBCopyError(error_output, supported
            ? @"True Tone is unavailable for the active display"
            : @"True Tone is not supported by the active display");
        return 0;
    }
}

int sb_true_tone_set(int enabled, SBFeatureStatus *status, char **error_output) {
    @autoreleasepool {
        SBFeatureStatus before = {0};
        int readResult = sb_true_tone_get(&before, error_output);
        if (readResult != 0 || !before.available) {
            if (status != NULL) *status = before;
            return readResult == 0 ? -1 : readResult;
        }
        id client = SBNewRuntimeClient(@"CoreBrightness", @"CBTrueToneClient", error_output);
        SEL selector = sel_registerName("setEnabled:");
        if (client == nil || ![client respondsToSelector:selector]) {
            SBCopyError(error_output, @"True Tone cannot be changed on this macOS version");
            return -1;
        }
        BOOL wrote = ((BOOL (*)(id, SEL, BOOL))objc_msgSend)(client, selector, enabled != 0);
        if (!wrote) {
            SBCopyError(error_output, @"macOS rejected the True Tone change");
            return -1;
        }
        usleep(120000);
        int result = sb_true_tone_get(status, error_output);
        if (result == 0 && status != NULL && status->enabled != (enabled != 0)) {
            SBCopyError(error_output, @"True Tone did not reach the requested state");
            return -1;
        }
        return result;
    }
}

static id SBLowPowerModeClient(char **error_output) {
    static id client;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        if (!SBLoadPrivateFramework(@"LowPowerMode")) return;
        Class clientClass = NSClassFromString(@"_PMLowPowerMode");
        SEL sharedSelector = sel_registerName("sharedInstance");
        if (clientClass != Nil && [clientClass respondsToSelector:sharedSelector])
            client = ((id (*)(id, SEL))objc_msgSend)(clientClass, sharedSelector);
    });
    if (client == nil) {
        SBCopyError(error_output, @"Low Power Mode is unsupported on this Mac");
        return nil;
    }
    return client;
}

int sb_low_power_get(SBFeatureStatus *status, char **error_output) {
    @autoreleasepool {
        SBResetFeatureStatus(status);
        id client = SBLowPowerModeClient(error_output);
        SEL selector = sel_registerName("getPowerMode");
        if (client == nil || ![client respondsToSelector:selector]) return -1;
        NSInteger mode = ((NSInteger (*)(id, SEL))objc_msgSend)(client, selector);
        if (mode < 0) {
            SBCopyError(error_output, @"Low Power Mode is unsupported on this Mac");
            return -1;
        }
        SBWriteFeatureStatus(status, YES, YES, mode != 0);
        return 0;
    }
}

int sb_low_power_set(int enabled, SBFeatureStatus *status, char **error_output) {
    @autoreleasepool {
        BOOL actualState = NO;
        int writeResult = SBSetControlCenterCheckbox(
            @"com.apple.menuextra.battery", @"energy-mode-low", enabled != 0,
            &actualState, error_output);
        if (writeResult != 0) return writeResult;
        usleep(180000);
        int result = sb_low_power_get(status, error_output);
        if (result == 0 && status != NULL && status->enabled != (enabled != 0)) {
            SBCopyError(error_output, @"Low Power Mode did not reach the requested state");
            return -1;
        }
        return result;
    }
}

int sb_high_power_get(SBFeatureStatus *status, char **error_output) {
    @autoreleasepool {
        SBResetFeatureStatus(status);
        id client = SBLowPowerModeClient(error_output);
        SEL selector = sel_registerName("getPowerMode");
        if (client == nil || ![client respondsToSelector:selector]) return -1;
        NSInteger mode = ((NSInteger (*)(id, SEL))objc_msgSend)(client, selector);
        if (mode < 0) {
            SBCopyError(error_output, @"High Power Mode is unsupported on this Mac");
            return -1;
        }
        SBWriteFeatureStatus(status, YES, YES, mode == 2);
        return 0;
    }
}

int sb_high_power_set(int enabled, SBFeatureStatus *status, char **error_output) {
    @autoreleasepool {
        BOOL actualState = NO;
        int writeResult = SBSetControlCenterCheckbox(
            @"com.apple.menuextra.battery", @"energy-mode-high", enabled != 0,
            &actualState, error_output);
        if (writeResult != 0) return writeResult;
        usleep(180000);
        int result = sb_high_power_get(status, error_output);
        if (result == 0 && status != NULL && status->enabled != (enabled != 0)) {
            SBCopyError(error_output, @"High Power Mode did not reach the requested state");
            return -1;
        }
        return result;
    }
}

static AXUIElementRef SBAXCopyElementByIdentifier(AXUIElementRef element, NSString *identifier,
                                                   BOOL prefix, NSInteger depth) {
    if (element == NULL || depth < 0) return NULL;
    CFTypeRef rawIdentifier = NULL;
    if (AXUIElementCopyAttributeValue(element, kAXIdentifierAttribute, &rawIdentifier) == kAXErrorSuccess &&
        rawIdentifier != NULL) {
        NSString *candidate = CFBridgingRelease(rawIdentifier);
        BOOL matches = [candidate isKindOfClass:NSString.class] &&
            (prefix ? [candidate hasPrefix:identifier] : [candidate isEqualToString:identifier]);
        if (matches) return (AXUIElementRef)CFRetain(element);
    }
    CFTypeRef rawChildren = NULL;
    if (AXUIElementCopyAttributeValue(element, kAXChildrenAttribute, &rawChildren) != kAXErrorSuccess ||
        rawChildren == NULL) return NULL;
    NSArray *children = CFBridgingRelease(rawChildren);
    for (id child in children) {
        AXUIElementRef found = SBAXCopyElementByIdentifier((__bridge AXUIElementRef)child, identifier, prefix, depth - 1);
        if (found != NULL) return found;
    }
    return NULL;
}

static BOOL SBAXElementEnabled(AXUIElementRef element) {
    if (element == NULL) return NO;
    CFTypeRef rawValue = NULL;
    if (AXUIElementCopyAttributeValue(element, kAXValueAttribute, &rawValue) != kAXErrorSuccess ||
        rawValue == NULL) return NO;
    id value = CFBridgingRelease(rawValue);
    return [value respondsToSelector:@selector(boolValue)] && [value boolValue];
}

static AXUIElementRef SBAXCopyElementInWindows(AXUIElementRef appElement,
                                               NSString *identifier, BOOL prefix) {
    CFTypeRef rawWindows = NULL;
    if (AXUIElementCopyAttributeValue(appElement, kAXWindowsAttribute, &rawWindows) != kAXErrorSuccess ||
        rawWindows == NULL) return NULL;
    NSArray *windows = CFBridgingRelease(rawWindows);
    for (id window in windows) {
        AXUIElementRef found = SBAXCopyElementByIdentifier(
            (__bridge AXUIElementRef)window, identifier, prefix, 10);
        if (found != NULL) return found;
    }
    return NULL;
}

static AXUIElementRef SBAXCopyActiveElementWithPrefix(AXUIElementRef element,
                                                       NSString *prefix, NSInteger depth) {
    if (element == NULL || depth < 0) return NULL;
    CFTypeRef rawIdentifier = NULL;
    if (AXUIElementCopyAttributeValue(element, kAXIdentifierAttribute, &rawIdentifier) == kAXErrorSuccess &&
        rawIdentifier != NULL) {
        NSString *identifier = CFBridgingRelease(rawIdentifier);
        if ([identifier isKindOfClass:NSString.class] && [identifier hasPrefix:prefix] &&
            SBAXElementEnabled(element)) return (AXUIElementRef)CFRetain(element);
    }
    CFTypeRef rawChildren = NULL;
    if (AXUIElementCopyAttributeValue(element, kAXChildrenAttribute, &rawChildren) != kAXErrorSuccess ||
        rawChildren == NULL) return NULL;
    NSArray *children = CFBridgingRelease(rawChildren);
    for (id child in children) {
        AXUIElementRef found = SBAXCopyActiveElementWithPrefix(
            (__bridge AXUIElementRef)child, prefix, depth - 1);
        if (found != NULL) return found;
    }
    return NULL;
}

static AXUIElementRef SBAXCopyFocusCheckbox(AXUIElementRef appElement, BOOL activeOnly,
                                            NSString *exactIdentifier) {
    if (exactIdentifier != nil) {
        return SBAXCopyElementInWindows(appElement, exactIdentifier, NO);
    }
    if (!activeOnly)
        return SBAXCopyElementInWindows(appElement, @"focus-mode-activity-", YES);
    CFTypeRef rawWindows = NULL;
    if (AXUIElementCopyAttributeValue(appElement, kAXWindowsAttribute, &rawWindows) != kAXErrorSuccess ||
        rawWindows == NULL) return NULL;
    NSArray *windows = CFBridgingRelease(rawWindows);
    for (id window in windows) {
        AXUIElementRef found = SBAXCopyActiveElementWithPrefix(
            (__bridge AXUIElementRef)window, @"focus-mode-activity-", 10);
        if (found != NULL) return found;
    }
    return NULL;
}

static NSRunningApplication *SBControlCenterApplication(void) {
    return [NSRunningApplication runningApplicationsWithBundleIdentifier:@"com.apple.controlcenter"].firstObject;
}

static AXUIElementRef SBAXCopyControlCenterMenuItem(AXUIElementRef appElement,
                                                    NSString *identifier) {
    CFTypeRef rawMenuBar = NULL;
    AXError menuError = AXUIElementCopyAttributeValue(appElement, kAXMenuBarAttribute, &rawMenuBar);
    if (menuError != kAXErrorSuccess || rawMenuBar == NULL) return NULL;
    AXUIElementRef menuBar = (AXUIElementRef)rawMenuBar;
    AXUIElementRef item = SBAXCopyElementByIdentifier(menuBar, identifier, NO, 8);
    CFRelease(menuBar);
    return item;
}

static int SBSetControlCenterCheckbox(NSString *menuIdentifier, NSString *checkboxIdentifier,
                                      BOOL enabled, BOOL *actualState, char **error_output) {
    NSDictionary *options = @{(__bridge NSString *)kAXTrustedCheckOptionPrompt: @YES};
    if (!AXIsProcessTrustedWithOptions((__bridge CFDictionaryRef)options)) {
        SBCopyError(error_output, @"Accessibility permission is required for this control");
        return -1;
    }

    NSRunningApplication *controlCenter = SBControlCenterApplication();
    if (controlCenter == nil) {
        SBCopyError(error_output, @"Control Center is not running");
        return -1;
    }
    AXUIElementRef appElement = AXUIElementCreateApplication(controlCenter.processIdentifier);
    AXUIElementRef menuItem = SBAXCopyControlCenterMenuItem(appElement, menuIdentifier);
    if (menuItem == NULL) {
        CFRelease(appElement);
        SBCopyError(error_output, @"macOS could not find the requested Control Center item");
        return -1;
    }
    AXError pressError = AXUIElementPerformAction(menuItem, kAXPressAction);
    if (pressError != kAXErrorSuccess) {
        if (menuItem != NULL) CFRelease(menuItem);
        CFRelease(appElement);
        SBCopyError(error_output, [NSString stringWithFormat:
            @"macOS could not open the requested Control Center item (AX error %d)", pressError]);
        return -1;
    }

    AXUIElementRef checkbox = NULL;
    for (NSInteger attempt = 0; attempt < 20 && checkbox == NULL; attempt++) {
        usleep(50000);
        checkbox = SBAXCopyElementInWindows(appElement, checkboxIdentifier, NO);
    }

    BOOL success = checkbox != NULL;
    if (checkbox != NULL) {
        BOOL current = SBAXElementEnabled(checkbox);
        if (current != enabled)
            success = AXUIElementPerformAction(checkbox, kAXPressAction) == kAXErrorSuccess;
        usleep(180000);
        if (actualState != NULL) *actualState = SBAXElementEnabled(checkbox);
        CFRelease(checkbox);
    }

    AXUIElementPerformAction(menuItem, kAXPressAction);
    CFRelease(menuItem);
    CFRelease(appElement);

    if (!success || (actualState != NULL && *actualState != enabled)) {
        SBCopyError(error_output, @"The requested Control Center switch did not reach the requested state");
        return -1;
    }
    return 0;
}

static INFocusStatusAuthorizationStatus SBRequestFocusAuthorization(char **error_output) {
    if (!SBHasFocusUsageDescription()) {
        SBCopyError(error_output, @"Focus status permission is unavailable because the app usage description is missing");
        return INFocusStatusAuthorizationStatusRestricted;
    }
    INFocusStatusCenter *center = INFocusStatusCenter.defaultCenter;
    INFocusStatusAuthorizationStatus status = center.authorizationStatus;
    if (status != INFocusStatusAuthorizationStatusNotDetermined) return status;

    __block INFocusStatusAuthorizationStatus resolved = status;
    __block BOOL completed = NO;
    void (^completion)(INFocusStatusAuthorizationStatus) = ^(INFocusStatusAuthorizationStatus result) {
        resolved = result;
        completed = YES;
    };

    if (NSThread.isMainThread) {
        [center requestAuthorizationWithCompletionHandler:^(INFocusStatusAuthorizationStatus result) {
            completion(result);
        }];
        NSDate *deadline = [NSDate dateWithTimeIntervalSinceNow:20.0];
        while (!completed && deadline.timeIntervalSinceNow > 0) {
            [NSRunLoop.currentRunLoop runMode:NSDefaultRunLoopMode
                                    beforeDate:[NSDate dateWithTimeIntervalSinceNow:0.05]];
        }
    } else {
        dispatch_semaphore_t semaphore = dispatch_semaphore_create(0);
        dispatch_async(dispatch_get_main_queue(), ^{
            [center requestAuthorizationWithCompletionHandler:^(INFocusStatusAuthorizationStatus result) {
                completion(result);
                dispatch_semaphore_signal(semaphore);
            }];
        });
        dispatch_semaphore_wait(semaphore, dispatch_time(DISPATCH_TIME_NOW, 20 * NSEC_PER_SEC));
    }
    if (!completed) {
        SBCopyError(error_output, @"Focus status authorization timed out");
        return INFocusStatusAuthorizationStatusNotDetermined;
    }
    return resolved;
}

int sb_focus_get(SBFeatureStatus *status, char **error_output) {
    @autoreleasepool {
        SBResetFeatureStatus(status);
        if (!SBHasFocusUsageDescription()) {
            SBCopyError(error_output, @"Focus status permission is unavailable in this app build");
            return -1;
        }
        if (NSClassFromString(@"INFocusStatusCenter") == Nil) {
            SBCopyError(error_output, @"Focus status is unavailable on this macOS version");
            return -1;
        }
        INFocusStatusCenter *center = INFocusStatusCenter.defaultCenter;
        if (center.authorizationStatus != INFocusStatusAuthorizationStatusAuthorized) {
            SBWriteFeatureStatus(status, YES, NO, NO);
            return 0;
        }
        NSNumber *focused = center.focusStatus.isFocused;
        if (focused == nil) {
            SBWriteFeatureStatus(status, YES, NO, NO);
            SBCopyError(error_output, @"Focus status is currently unknown");
            return 0;
        }
        SBWriteFeatureStatus(status, YES, YES, focused.boolValue);
        return 0;
    }
}

int sb_focus_set(int enabled, SBFeatureStatus *status, char **error_output) {
    @autoreleasepool {
        SBResetFeatureStatus(status);
        INFocusStatusAuthorizationStatus authorization = SBRequestFocusAuthorization(error_output);
        if (authorization != INFocusStatusAuthorizationStatusAuthorized) {
            SBWriteFeatureStatus(status, YES, NO, NO);
            if (authorization == INFocusStatusAuthorizationStatusDenied)
                SBCopyError(error_output, @"Focus status permission was denied");
            else if (authorization == INFocusStatusAuthorizationStatusRestricted)
                SBCopyError(error_output, @"Focus status permission is restricted");
            else
                SBCopyError(error_output, @"Focus status permission is required");
            return -1;
        }

        NSNumber *knownState = INFocusStatusCenter.defaultCenter.focusStatus.isFocused;
        if (knownState != nil && knownState.boolValue == (enabled != 0)) {
            SBWriteFeatureStatus(status, YES, YES, knownState.boolValue);
            return 0;
        }

        NSDictionary *options = @{(__bridge NSString *)kAXTrustedCheckOptionPrompt: @YES};
        if (!AXIsProcessTrustedWithOptions((__bridge CFDictionaryRef)options)) {
            SBCopyError(error_output, @"Accessibility permission is required to change Focus");
            SBWriteFeatureStatus(status, YES, YES, knownState.boolValue);
            return -1;
        }

        NSRunningApplication *controlCenter = SBControlCenterApplication();
        if (controlCenter == nil) {
            SBCopyError(error_output, @"Control Center is not running");
            return -1;
        }
        AXUIElementRef appElement = AXUIElementCreateApplication(controlCenter.processIdentifier);
        AXUIElementRef menuItem = SBAXCopyControlCenterMenuItem(
            appElement, @"com.apple.menuextra.focusmode");
        if (menuItem == NULL || AXUIElementPerformAction(menuItem, kAXPressAction) != kAXErrorSuccess) {
            if (menuItem != NULL) CFRelease(menuItem);
            CFRelease(appElement);
            SBCopyError(error_output, @"macOS could not open the Focus control");
            return -1;
        }

        BOOL panelOpen = YES;
        AXUIElementRef target = NULL;
        for (NSInteger attempt = 0; attempt < 20 && target == NULL; attempt++) {
            usleep(50000);
            if (enabled) {
                target = SBAXCopyFocusCheckbox(appElement, NO,
                    @"focus-mode-activity-com.apple.donotdisturb.mode.default");
            } else {
                target = SBAXCopyFocusCheckbox(appElement, YES, nil);
            }
        }

        BOOL success = NO;
        if (target != NULL) {
            BOOL targetState = SBAXElementEnabled(target);
            if (targetState == (enabled != 0)) success = YES;
            else success = AXUIElementPerformAction(target, kAXPressAction) == kAXErrorSuccess;
            CFRelease(target);
        }

        usleep(180000);
        AXUIElementRef active = SBAXCopyFocusCheckbox(appElement, YES, nil);
        BOOL actualState = active != NULL;
        if (active != NULL) CFRelease(active);

        if (panelOpen && menuItem != NULL) AXUIElementPerformAction(menuItem, kAXPressAction);
        if (menuItem != NULL) CFRelease(menuItem);
        CFRelease(appElement);

        SBWriteFeatureStatus(status, YES, YES, actualState);
        if (!success || actualState != (enabled != 0)) {
            SBCopyError(error_output, @"Focus did not reach the requested state");
            return -1;
        }
        return 0;
    }
}

static BOOL SBIsBluetoothAudioDevice(IOBluetoothDevice *device) {
    if (device == nil) return NO;
    if (device.deviceClassMajor == kBluetoothDeviceClassMajorAudio) return YES;
    if ((device.serviceClassMajor & kBluetoothServiceClassMajorAudio) != 0) return YES;
    NSString *name = device.name ?: @"";
    return [name rangeOfString:@"AirPods" options:NSCaseInsensitiveSearch].location != NSNotFound ||
           [name rangeOfString:@"Beats" options:NSCaseInsensitiveSearch].location != NSNotFound;
}

static IOBluetoothDevice *SBPreferredAudioDevice(void) {
    IOBluetoothDevice *selected = nil;
    for (IOBluetoothDevice *device in [IOBluetoothDevice pairedDevices]) {
        if (!SBIsBluetoothAudioDevice(device)) continue;
        if (selected == nil || (device.isConnected && !selected.isConnected)) {
            selected = device;
            continue;
        }
        if (device.isConnected == selected.isConnected) {
            NSDate *candidateDate = device.recentAccessDate ?: [NSDate distantPast];
            NSDate *selectedDate = selected.recentAccessDate ?: [NSDate distantPast];
            if ([candidateDate compare:selectedDate] == NSOrderedDescending) selected = device;
        }
    }
    return selected;
}

char *sb_audio_device_snapshot_json(void) {
    @autoreleasepool {
        IOBluetoothDevice *device = SBPreferredAudioDevice();
        NSDictionary *snapshot = device
            ? @{
                @"paired": @YES,
                @"connected": @(device.isConnected),
                @"name": device.name ?: @"Bluetooth headphones"
              }
            : @{
                @"paired": @NO,
                @"connected": @NO,
                @"name": @"Bluetooth headphones"
              };
        NSData *data = [NSJSONSerialization dataWithJSONObject:snapshot options:0 error:nil];
        NSString *json = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
        return strdup(json.UTF8String ?: "{\"paired\":false,\"connected\":false,\"name\":\"Bluetooth headphones\"}");
    }
}

int sb_audio_device_set_connected(int enabled, char **error_output) {
    @autoreleasepool {
        IOBluetoothDevice *device = SBPreferredAudioDevice();
        if (device == nil) {
            SBCopyError(error_output, @"No paired Bluetooth audio device was found");
            return -1;
        }
        if (device.isConnected == (enabled != 0)) return 0;

        __block IOReturn status = kIOReturnError;
        dispatch_semaphore_t completed = dispatch_semaphore_create(0);
        dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
            @autoreleasepool {
                status = enabled ? [device openConnection] : [device closeConnection];
                if (!enabled && device.isConnected) {
                    usleep(250000);
                    status = [device closeConnection];
                }
                dispatch_semaphore_signal(completed);
            }
        });

        if (dispatch_semaphore_wait(
                completed,
                dispatch_time(DISPATCH_TIME_NOW, (int64_t)(7 * NSEC_PER_SEC))) != 0) {
            SBCopyError(error_output, @"The Bluetooth audio device did not respond within 7 seconds");
            return -2;
        }

        int stableReadings = 0;
        for (NSInteger attempt = 0; attempt < 25; attempt++) {
            if (device.isConnected == (enabled != 0)) {
                stableReadings += 1;
                if (stableReadings >= 4) return 0;
            } else {
                stableReadings = 0;
            }
            usleep(100000);
        }

        NSString *action = enabled ? @"connect" : @"disconnect";
        if (status == kIOReturnSuccess) {
            SBCopyError(error_output,
                [NSString stringWithFormat:@"The Bluetooth audio device did not %@ reliably", action]);
            return -3;
        }

        SBCopyError(error_output,
            [NSString stringWithFormat:@"The Bluetooth audio device could not %@ (0x%08x)", action, status]);
        return (int)status;
    }
}

void sb_free_string(char *value) {
    free(value);
}

void sb_clean_screen_stop(void);

static void SBHandleCleanEscapeEvent(NSEvent *event) {
    if (event.keyCode != 53) return;
    if (event.type == NSEventTypeKeyUp) {
        SBCleanEscapeHeld = NO;
        SBCleanEscapeGeneration += 1;
        return;
    }
    if (event.type != NSEventTypeKeyDown || SBCleanEscapeHeld) return;
    SBCleanEscapeHeld = YES;
    NSUInteger generation = ++SBCleanEscapeGeneration;
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(1.2 * NSEC_PER_SEC)),
                   dispatch_get_main_queue(), ^{
        if (SBCleanEscapeHeld && SBCleanEscapeGeneration == generation)
            sb_clean_screen_stop();
    });
}

static CGEventRef SBCleanKeyboardCallback(CGEventTapProxy proxy, CGEventType type,
                                           CGEventRef event, void *context) {
    (void)proxy; (void)context;
    if (type == kCGEventTapDisabledByTimeout || type == kCGEventTapDisabledByUserInput) {
        if (SBCleanKeyboardTap) CGEventTapEnable(SBCleanKeyboardTap, true);
        return event;
    }
    CGKeyCode key = (CGKeyCode)CGEventGetIntegerValueField(event, kCGKeyboardEventKeycode);
    if (key != 53) return event;
    if (type == kCGEventKeyUp) {
        SBCleanEscapeHeld = NO;
        SBCleanEscapeGeneration += 1;
        return event;
    }
    if (type == kCGEventKeyDown && !SBCleanEscapeHeld) {
        SBCleanEscapeHeld = YES;
        NSUInteger generation = ++SBCleanEscapeGeneration;
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(1.2 * NSEC_PER_SEC)),
                       dispatch_get_main_queue(), ^{
            if (SBCleanEscapeHeld && SBCleanEscapeGeneration == generation)
                sb_clean_screen_stop();
        });
    }
    return event;
}

static void SBStartCleanEscapeTap(void) {
    if (SBCleanKeyboardTap != NULL) return;
    [NSThread detachNewThreadWithBlock:^{
        @autoreleasepool {
            CGEventMask mask = CGEventMaskBit(kCGEventKeyDown) | CGEventMaskBit(kCGEventKeyUp);
            CFMachPortRef tap = CGEventTapCreate(
                kCGSessionEventTap, kCGHeadInsertEventTap, kCGEventTapOptionListenOnly,
                mask, SBCleanKeyboardCallback, NULL);
            if (tap == NULL) return;
            CFRunLoopSourceRef source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0);
            SBCleanKeyboardTap = tap;
            SBCleanKeyboardTapSource = source;
            SBCleanKeyboardRunLoop = CFRunLoopGetCurrent();
            CFRetain(SBCleanKeyboardRunLoop);
            CFRunLoopAddSource(SBCleanKeyboardRunLoop, source, kCFRunLoopCommonModes);
            CGEventTapEnable(tap, true);
            CFRunLoopRun();
            SBCleanKeyboardTap = NULL;
            SBCleanKeyboardTapSource = NULL;
            CFRelease(source);
            CFRelease(tap);
            CFRelease(SBCleanKeyboardRunLoop);
            SBCleanKeyboardRunLoop = NULL;
        }
    }];
}

static void SBStartCleanEscapePolling(void) {
    if (SBCleanEscapePollTimer != nil) return;
    SBCleanEscapePressedAt = 0;
    dispatch_queue_t queue = dispatch_get_global_queue(QOS_CLASS_USER_INTERACTIVE, 0);
    SBCleanEscapePollTimer = dispatch_source_create(DISPATCH_SOURCE_TYPE_TIMER, 0, 0, queue);
    dispatch_source_set_timer(SBCleanEscapePollTimer, dispatch_time(DISPATCH_TIME_NOW, 0),
                              50 * NSEC_PER_MSEC, 5 * NSEC_PER_MSEC);
    dispatch_source_set_event_handler(SBCleanEscapePollTimer, ^{
        if (!SBCleanActive) return;
        // The session state can miss a physical key while a screen-saver-level
        // window is active. HID state reads the keyboard directly; keeping both
        // sources also preserves synthetic-key and remote-input compatibility.
        BOOL pressed = CGEventSourceKeyState(kCGEventSourceStateHIDSystemState, 53) ||
                       CGEventSourceKeyState(kCGEventSourceStateCombinedSessionState, 53);
        if (!pressed) {
            SBCleanEscapePressedAt = 0;
            return;
        }
        CFAbsoluteTime now = CFAbsoluteTimeGetCurrent();
        if (SBCleanEscapePressedAt == 0) SBCleanEscapePressedAt = now;
        if (now - SBCleanEscapePressedAt >= 1.2) {
            SBCleanEscapePressedAt = now + 60.0;
            dispatch_async(dispatch_get_main_queue(), ^{ sb_clean_screen_stop(); });
        }
    });
    dispatch_resume(SBCleanEscapePollTimer);
}

@interface SBCleanWindow : NSWindow
@end

@implementation SBCleanWindow
- (BOOL)canBecomeKeyWindow { return YES; }
- (BOOL)canBecomeMainWindow { return YES; }
@end

@interface SBCleanView : NSView
@end

@implementation SBCleanView
- (BOOL)acceptsFirstResponder { return YES; }
- (BOOL)acceptsFirstMouse:(NSEvent *)event { (void)event; return YES; }
- (void)drawRect:(NSRect)dirtyRect {
    [[NSColor colorWithCalibratedWhite:0.025 alpha:1.0] setFill];
    NSRectFill(dirtyRect);

    NSDictionary *titleStyle = @{
        NSFontAttributeName: [NSFont systemFontOfSize:22 weight:NSFontWeightSemibold],
        NSForegroundColorAttributeName: [NSColor colorWithCalibratedWhite:0.9 alpha:0.92]
    };
    NSDictionary *hintStyle = @{
        NSFontAttributeName: [NSFont systemFontOfSize:13 weight:NSFontWeightRegular],
        NSForegroundColorAttributeName: [NSColor colorWithCalibratedWhite:0.65 alpha:0.85]
    };
    NSString *title = @"Screen Cleaning Mode";
    NSString *hint = @"Hold Esc to finish";
    NSSize titleSize = [title sizeWithAttributes:titleStyle];
    NSSize hintSize = [hint sizeWithAttributes:hintStyle];
    CGFloat centerX = NSMidX(self.bounds);
    CGFloat centerY = NSMidY(self.bounds);
    [title drawAtPoint:NSMakePoint(centerX - titleSize.width / 2, centerY + 4) withAttributes:titleStyle];
    [hint drawAtPoint:NSMakePoint(centerX - hintSize.width / 2, centerY - 28) withAttributes:hintStyle];
}
- (void)keyDown:(NSEvent *)event {
    SBHandleCleanEscapeEvent(event);
}
- (void)keyUp:(NSEvent *)event {
    SBHandleCleanEscapeEvent(event);
}
- (void)cancelOperation:(id)sender {
    (void)sender;
    // AppKit routes Escape here for some responder-chain configurations.
    // The actual exit is still gated by the long-press detector.
}
- (void)mouseDown:(NSEvent *)event { (void)event; }
@end

static void SBRunOnMainSync(dispatch_block_t block) {
    if ([NSThread isMainThread]) block();
    else dispatch_sync(dispatch_get_main_queue(), block);
}

int sb_clean_screen_start(char **error_output) {
    (void)error_output;
    __block int result = 0;
    SBRunOnMainSync(^{
        if (SBCleanActive) return;
        SBCleanWindows = [NSMutableArray array];
        for (NSScreen *screen in NSScreen.screens) {
            NSWindow *window = [[SBCleanWindow alloc]
                initWithContentRect:screen.frame
                styleMask:NSWindowStyleMaskBorderless
                backing:NSBackingStoreBuffered
                defer:NO
                screen:screen];
            window.opaque = YES;
            window.backgroundColor = [NSColor blackColor];
            window.level = NSScreenSaverWindowLevel;
            window.collectionBehavior = NSWindowCollectionBehaviorCanJoinAllSpaces |
                                        NSWindowCollectionBehaviorFullScreenAuxiliary;
            window.releasedWhenClosed = NO;
            SBCleanView *view = [[SBCleanView alloc] initWithFrame:window.contentView.bounds];
            view.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
            window.contentView = view;
            [window makeKeyAndOrderFront:nil];
            [window makeFirstResponder:view];
            [SBCleanWindows addObject:window];
        }
        SBCleanActive = SBCleanWindows.count > 0;
        if (SBCleanActive) {
            SBCleanEscapeHeld = NO;
            SBCleanEscapeGeneration += 1;
            NSEventMask escapeMask = NSEventMaskKeyDown | NSEventMaskKeyUp;
            SBCleanLocalKeyMonitor = [NSEvent addLocalMonitorForEventsMatchingMask:escapeMask
                handler:^NSEvent *(NSEvent *event) {
                    SBHandleCleanEscapeEvent(event);
                    return event;
                }];
            SBCleanGlobalKeyMonitor = [NSEvent addGlobalMonitorForEventsMatchingMask:escapeMask
                handler:^(NSEvent *event) { SBHandleCleanEscapeEvent(event); }];
            SBStartCleanEscapeTap();
            SBStartCleanEscapePolling();
            [NSApp activateIgnoringOtherApps:YES];
            [SBCleanWindows.firstObject makeKeyAndOrderFront:nil];
            [SBCleanWindows.firstObject makeFirstResponder:SBCleanWindows.firstObject.contentView];
        }
        if (!SBCleanActive) result = -1;
    });
    if (result != 0) SBCopyError(error_output, @"No display is available for cleaning mode");
    return result;
}

void sb_clean_screen_stop(void) {
    SBRunOnMainSync(^{
        if (SBCleanLocalKeyMonitor != nil) {
            [NSEvent removeMonitor:SBCleanLocalKeyMonitor];
            SBCleanLocalKeyMonitor = nil;
        }
        if (SBCleanGlobalKeyMonitor != nil) {
            [NSEvent removeMonitor:SBCleanGlobalKeyMonitor];
            SBCleanGlobalKeyMonitor = nil;
        }
        SBCleanEscapeHeld = NO;
        SBCleanEscapeGeneration += 1;
        if (SBCleanKeyboardTap) CGEventTapEnable(SBCleanKeyboardTap, false);
        if (SBCleanKeyboardRunLoop) CFRunLoopStop(SBCleanKeyboardRunLoop);
        if (SBCleanEscapePollTimer != nil) {
            dispatch_source_cancel(SBCleanEscapePollTimer);
            SBCleanEscapePollTimer = nil;
        }
        SBCleanEscapePressedAt = 0;
        for (NSWindow *window in SBCleanWindows) [window orderOut:nil];
        [SBCleanWindows removeAllObjects];
        SBCleanWindows = nil;
        SBCleanActive = NO;
    });
}

int sb_clean_screen_active(void) {
    return SBCleanActive ? 1 : 0;
}

static BOOL SBIsEmergencyShortcut(CGEventRef event) {
    CGKeyCode key = (CGKeyCode)CGEventGetIntegerValueField(event, kCGKeyboardEventKeycode);
    CGEventFlags flags = CGEventGetFlags(event);
    BOOL command = (flags & kCGEventFlagMaskCommand) != 0;
    BOOL option = (flags & kCGEventFlagMaskAlternate) != 0;
    BOOL control = (flags & kCGEventFlagMaskControl) != 0;
    return (key == 53 && command && option) || (key == 12 && command && control);
}

static CGEventRef SBKeyboardCallback(CGEventTapProxy proxy, CGEventType type, CGEventRef event, void *context) {
    (void)proxy; (void)context;
    if (type == kCGEventTapDisabledByTimeout || type == kCGEventTapDisabledByUserInput) {
        if (SBKeyboardTap) CGEventTapEnable(SBKeyboardTap, true);
        return event;
    }
    if (SBIsEmergencyShortcut(event)) return event;
    return NULL;
}

int sb_keyboard_lock_start(char **error_output) {
    if (SBKeyboardActive) return 0;
    NSDictionary *options = @{(__bridge NSString *)kAXTrustedCheckOptionPrompt: @YES};
    if (!AXIsProcessTrustedWithOptions((__bridge CFDictionaryRef)options)) {
        SBCopyError(error_output, @"Accessibility permission is required to lock the keyboard");
        return -1;
    }

    dispatch_semaphore_t ready = dispatch_semaphore_create(0);
    __block BOOL started = NO;
    [NSThread detachNewThreadWithBlock:^{
        @autoreleasepool {
            CGEventMask mask = CGEventMaskBit(kCGEventKeyDown) |
                               CGEventMaskBit(kCGEventKeyUp) |
                               CGEventMaskBit(kCGEventFlagsChanged);
            CFMachPortRef tap = CGEventTapCreate(kCGSessionEventTap, kCGHeadInsertEventTap,
                kCGEventTapOptionDefault, mask, SBKeyboardCallback, NULL);
            if (tap == NULL) {
                dispatch_semaphore_signal(ready);
                return;
            }
            CFRunLoopSourceRef source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0);
            SBKeyboardTap = tap;
            SBKeyboardTapSource = source;
            SBKeyboardRunLoop = CFRunLoopGetCurrent();
            CFRetain(SBKeyboardRunLoop);
            SBKeyboardActive = YES;
            started = YES;
            CFRunLoopAddSource(SBKeyboardRunLoop, source, kCFRunLoopCommonModes);
            CGEventTapEnable(tap, true);
            dispatch_semaphore_signal(ready);
            CFRunLoopRun();
            SBKeyboardActive = NO;
            SBKeyboardTap = NULL;
            SBKeyboardTapSource = NULL;
            CFRelease(source);
            CFRelease(tap);
            CFRelease(SBKeyboardRunLoop);
            SBKeyboardRunLoop = NULL;
        }
    }];

    dispatch_semaphore_wait(ready, dispatch_time(DISPATCH_TIME_NOW, 2 * NSEC_PER_SEC));
    if (!started) {
        SBCopyError(error_output, @"macOS could not start the keyboard lock");
        return -1;
    }
    return 0;
}

void sb_keyboard_lock_stop(void) {
    if (SBKeyboardTap) CGEventTapEnable(SBKeyboardTap, false);
    if (SBKeyboardRunLoop) CFRunLoopStop(SBKeyboardRunLoop);
    SBKeyboardActive = NO;
}

int sb_keyboard_lock_active(void) {
    return SBKeyboardActive ? 1 : 0;
}
