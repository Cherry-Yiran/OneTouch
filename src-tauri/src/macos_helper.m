#import <AppKit/AppKit.h>
#import <ApplicationServices/ApplicationServices.h>
#import <IOBluetooth/IOBluetooth.h>
#import <IOKit/hidsystem/IOLLEvent.h>
#import <Intents/Intents.h>
#import <objc/message.h>
#import <objc/runtime.h>

#include <dlfcn.h>
#include <math.h>
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
typedef void (*SBNativePopoverCallback)(const char *action, const char *control_id, int value);
typedef void (*SBNativePreferencesCallback)(const char *action, const char *control_id,
                                            const char *payload);
static __strong NSStatusItem *SBStatusItem;
static __strong NSObject *SBStatusTargetInstance;
static __strong NSImageView *SBStatusIconView;
static SBStatusItemCallback SBStatusCallback = NULL;
static SBNativePopoverCallback SBNativePopoverActionCallback = NULL;
static SBNativePreferencesCallback SBNativePreferencesActionCallback = NULL;
static __strong NSPanel *SBNativePopoverPanel;
static __strong NSWindowController *SBNativePreferencesWindowController;
@class SBAccessibilityGuideController;
static __strong SBAccessibilityGuideController *SBAccessibilityGuide;
static __strong NSRunningApplication *SBPreviousFrontmostApplication;
static id SBNativePopoverLocalEventMonitor;
static id SBNativePopoverGlobalEventMonitor;
static BOOL SBNativePopoverPersistent = NO;

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

@interface SBPassthroughImageView : NSImageView
@end

@interface SBTimerMenuTarget : NSObject
@property(nonatomic, assign) NSInteger selectedTag;
- (void)selectDuration:(NSMenuItem *)sender;
@end

@interface SBNativeControlTarget : NSObject
@property(nonatomic, copy) NSString *controlID;
@property(nonatomic, copy) NSString *actionName;
@property(nonatomic, assign) BOOL timed;
@property(nonatomic, assign) BOOL useChinese;
@property(nonatomic, weak) NSControl *control;
- (void)performControlAction:(NSControl *)sender;
@end

@interface SBNativePopoverPanelWindow : NSPanel
@end

@interface SBNativeRowsDocumentView : NSView
@end

@interface SBAccessibilityGuidePanel : NSPanel
@end

@interface SBAccessibilityDragView : NSView <NSDraggingSource>
@property(nonatomic, strong) NSURL *appURL;
@property(nonatomic, strong) NSImage *appIcon;
@property(nonatomic, strong) NSTextField *nameLabel;
@property(nonatomic, strong) NSTextField *hintLabel;
@property(nonatomic, assign) NSPoint mouseDownLocation;
@property(nonatomic, assign) BOOL dragStarted;
@property(nonatomic, assign) BOOL pressed;
@property(nonatomic, copy) void (^draggingChanged)(BOOL dragging);
- (instancetype)initWithAppURL:(NSURL *)appURL;
- (void)updateName:(NSString *)name hint:(NSString *)hint fallback:(NSString *)fallback;
@end

@interface SBAccessibilityGuideController : NSObject
@property(nonatomic, strong) SBAccessibilityGuidePanel *panel;
@property(nonatomic, strong) NSView *contentHostView;
@property(nonatomic, strong) NSTextField *titleLabel;
@property(nonatomic, strong) NSTextField *explanationLabel;
@property(nonatomic, strong) NSTextField *privacyLabel;
@property(nonatomic, strong) SBAccessibilityDragView *dragView;
@property(nonatomic, strong) NSButton *closeButton;
@property(nonatomic, strong) NSButton *quitButton;
@property(nonatomic, strong) NSImageView *successIcon;
@property(nonatomic, strong) NSTextField *successStatusLabel;
@property(nonatomic, strong) NSDictionary *model;
@property(nonatomic, strong) NSTimer *trackingTimer;
@property(nonatomic, strong) NSTimer *permissionTimer;
@property(nonatomic, assign) BOOL sawSystemSettings;
@property(nonatomic, assign) BOOL handledInitialModel;
@property(nonatomic, assign) BOOL showingSuccess;
@property(nonatomic, assign) BOOL lastKnownTrusted;
- (void)updateModel:(NSDictionary *)model;
- (void)showOpeningSystemSettings:(BOOL)openSettings;
- (void)hide;
@end

@interface SBNativePopoverController : NSViewController
@property(nonatomic, strong) NSDictionary *model;
@property(nonatomic, strong) NSMutableArray<SBNativeControlTarget *> *controlTargets;
@property(nonatomic, strong) NSMutableDictionary<NSString *, NSDictionary *> *rowBindings;
@property(nonatomic, copy) NSString *layoutSignature;
@property(nonatomic, strong) NSView *contentHostView;
- (void)applyModel:(NSDictionary *)model;
@end

@interface SBNativePreferencesController
    : NSTabViewController <NSTableViewDataSource, NSTableViewDelegate, NSWindowDelegate>
@property(nonatomic, strong) NSDictionary *model;
@property(nonatomic, strong) NSArray<NSDictionary *> *rows;
@property(nonatomic, strong) NSTableView *customTable;
@property(nonatomic, strong) NSTableView *shortcutTable;
@property(nonatomic, strong) NSSearchField *customSearchField;
@property(nonatomic, strong) NSSearchField *shortcutSearchField;
@property(nonatomic, strong) NSPopUpButton *languagePopup;
@property(nonatomic, strong) NSSwitch *loginSwitch;
@property(nonatomic, strong) NSTextField *loginNote;
@property(nonatomic, strong) NSTextField *visibleCountLabel;
@property(nonatomic, strong) NSTextField *shortcutHint;
@property(nonatomic, strong) NSTextField *aboutVersion;
@property(nonatomic, strong) NSButton *aboutGitHubButton;
@property(nonatomic, strong) NSButton *aboutUpdateButton;
@property(nonatomic, strong) NSTextField *aboutUpdateStatus;
@property(nonatomic, strong) id shortcutMonitor;
@property(nonatomic, copy) NSString *recordingShortcutID;
- (void)applyModel:(NSDictionary *)model;
- (void)openAboutGitHub:(id)sender;
- (void)checkForUpdates:(id)sender;
- (void)updatePreferencesWindowTitle;
- (void)resizeWindowForSelectedTabAnimated:(BOOL)animated;
@end

static void SBActivateForNativePopover(void) {
    NSRunningApplication *frontmost = NSWorkspace.sharedWorkspace.frontmostApplication;
    if (frontmost != nil &&
        frontmost.processIdentifier != NSProcessInfo.processInfo.processIdentifier) {
        SBPreviousFrontmostApplication = frontmost;
    }
    [NSApp activateIgnoringOtherApps:YES];
}

static void SBShowNativePopover(BOOL persistent);
static void SBHideNativePopover(BOOL restorePreviousApplication);

static void SBRestorePreviousApplicationAfterPopover(void) {
    NSRunningApplication *previous = SBPreviousFrontmostApplication;
    SBPreviousFrontmostApplication = nil;
    if (previous == nil || previous.terminated) return;

    NSRunningApplication *frontmost = NSWorkspace.sharedWorkspace.frontmostApplication;
    if (frontmost != nil &&
        frontmost.processIdentifier == NSProcessInfo.processInfo.processIdentifier) {
        [previous activateWithOptions:(NSApplicationActivationOptions)0];
    }
}

static void SBEmitNativePopoverAction(NSString *action, NSString *controlID, NSInteger value) {
    if (SBNativePopoverActionCallback == NULL) return;
    SBNativePopoverActionCallback(action.UTF8String, controlID.UTF8String, (int)value);
}

static NSInteger SBShowTimerMenuForView(NSView *view, BOOL useChinese) {
    NSArray<NSString *> *titles = useChinese
        ? @[@"30 分钟", @"1 小时", @"2 小时", @"4 小时", @"直到今天结束", @"不定时"]
        : @[@"30 Minutes", @"1 Hour", @"2 Hours", @"4 Hours", @"Until End of Day", @"No Timer"];
    SBTimerMenuTarget *target = [SBTimerMenuTarget new];
    NSMenu *menu = [[NSMenu alloc] initWithTitle:@""];
    menu.autoenablesItems = NO;
    menu.minimumWidth = 154.0;

    for (NSUInteger index = 0; index < titles.count; index += 1) {
        if (index == 5) [menu addItem:NSMenuItem.separatorItem];
        NSMenuItem *item = [[NSMenuItem alloc] initWithTitle:titles[index]
                                                      action:@selector(selectDuration:)
                                               keyEquivalent:@""];
        item.target = target;
        item.tag = index;
        item.enabled = YES;
        [menu addItem:item];
    }

    [menu update];
    NSSize menuSize = menu.size;
    CGFloat x = NSMaxX(view.bounds) - MAX(menuSize.width, menu.minimumWidth);
    [menu popUpMenuPositioningItem:nil
                       atLocation:NSMakePoint(x, NSMinY(view.bounds) - 5.0)
                           inView:view];
    return target.selectedTag;
}

static NSImage *SBSingleSwitchTemplate(CGFloat width) {
    CGFloat height = round(width * 0.58);
    NSImage *image = [[NSImage alloc] initWithSize:NSMakeSize(width, height)];
    [image lockFocus];

    CGFloat strokeWidth = MAX(1.2, width * 0.085);
    NSRect trackRect = NSInsetRect(NSMakeRect(0.0, 0.0, width, height),
                                   strokeWidth * 0.5, strokeWidth * 0.5);
    NSBezierPath *track = [NSBezierPath bezierPathWithRoundedRect:trackRect
                                                          xRadius:NSHeight(trackRect) * 0.5
                                                          yRadius:NSHeight(trackRect) * 0.5];
    track.lineWidth = strokeWidth;
    [NSColor.blackColor setStroke];
    [track stroke];

    CGFloat knobDiameter = NSHeight(trackRect) - strokeWidth * 2.1;
    NSRect knobRect = NSMakeRect(NSMaxX(trackRect) - strokeWidth - knobDiameter,
                                 NSMidY(trackRect) - knobDiameter * 0.5,
                                 knobDiameter, knobDiameter);
    [NSColor.blackColor setFill];
    [[NSBezierPath bezierPathWithOvalInRect:knobRect] fill];

    [image unlockFocus];
    image.template = YES;
    image.accessibilityDescription = @"OneTouch";
    return image;
}

static void SBUpdateStatusImage(void) {
    if (SBStatusItem.button == nil) return;
    NSButton *button = SBStatusItem.button;

    // macOS 26 can park a newly created image-only status item in a screen-edge
    // holding window even though NSStatusItem.isVisible remains YES. A real
    // (but visually transparent) text title keeps the item in the menu bar.
    // Draw the authored template icon in a pass-through overlay so AppKit can
    // apply the menu bar's current appearance while the whole 24 pt button
    // remains clickable.
    button.image = nil;
    button.imagePosition = NSNoImage;
    button.attributedTitle = [[NSAttributedString alloc]
        initWithString:@"P"
            attributes:@{
                NSForegroundColorAttributeName: NSColor.clearColor,
                NSFontAttributeName: [NSFont systemFontOfSize:1.0],
            }];
    if (SBStatusIconView == nil) {
        SBStatusIconView = [[SBPassthroughImageView alloc] initWithFrame:NSZeroRect];
        SBStatusIconView.translatesAutoresizingMaskIntoConstraints = NO;
        SBStatusIconView.imageScaling = NSImageScaleNone;
        SBStatusIconView.accessibilityElement = NO;
        [button addSubview:SBStatusIconView];
        [NSLayoutConstraint activateConstraints:@[
            [SBStatusIconView.centerXAnchor constraintEqualToAnchor:button.centerXAnchor],
            [SBStatusIconView.centerYAnchor constraintEqualToAnchor:button.centerYAnchor],
            [SBStatusIconView.widthAnchor constraintEqualToConstant:18.0],
            [SBStatusIconView.heightAnchor constraintEqualToConstant:18.0],
        ]];
    }
    SBStatusIconView.image = SBSingleSwitchTemplate(16.0);
    // Keep the standard AppKit rendering pipeline. A nil content tint lets the
    // template image follow the menu bar's light/dark and accessibility state.
    SBStatusIconView.contentTintColor = nil;
    button.accessibilityLabel = @"OneTouch";
}

static BOOL SBStatusItemHasScreenAnchor(void) {
    NSButton *button = SBStatusItem.button;
    NSWindow *window = button.window;
    if (button == nil || window == nil || !window.isVisible) return NO;

    NSRect frame = [window convertRectToScreen:button.frame];
    NSScreen *screen = window.screen ?: NSScreen.mainScreen;
    if (screen == nil || NSWidth(frame) < 1.0 || NSHeight(frame) < 1.0) return NO;

    // AppKit's isVisible remains YES for a status item parked in a screen-edge
    // holding window. A usable status item must actually intersect the
    // menu-bar strip at the top of its screen.
    CGFloat menuBarFloor = NSMaxY(screen.frame) - NSStatusBar.systemStatusBar.thickness - 6.0;
    return NSMaxY(frame) >= menuBarFloor && NSIntersectsRect(frame, screen.frame);
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

@implementation SBPassthroughImageView
- (NSView *)hitTest:(NSPoint)point {
    return nil;
}
@end

@implementation SBTimerMenuTarget
- (instancetype)init {
    self = [super init];
    if (self != nil) _selectedTag = -1;
    return self;
}
- (void)selectDuration:(NSMenuItem *)sender {
    self.selectedTag = sender.tag;
}
@end

@implementation SBNativeControlTarget
- (void)performControlAction:(NSControl *)sender {
    if (self.timed && [sender isKindOfClass:NSSwitch.class] &&
        ((NSSwitch *)sender).state == NSControlStateValueOn) {
        NSInteger selection = SBShowTimerMenuForView(sender, self.useChinese);
        if (selection >= 0) {
            SBEmitNativePopoverAction(@"timer", self.controlID, selection);
        } else {
            ((NSSwitch *)sender).state = NSControlStateValueOff;
        }
        return;
    }

    NSInteger value = 1;
    if ([sender isKindOfClass:NSSwitch.class]) {
        value = ((NSSwitch *)sender).state == NSControlStateValueOn ? 1 : 0;
    }
    SBEmitNativePopoverAction(self.actionName ?: @"activate", self.controlID ?: @"", value);
}
@end

static NSTextField *SBLabel(NSString *value, NSFont *font, NSColor *color) {
    NSTextField *label = [NSTextField labelWithString:value ?: @""];
    label.font = font;
    label.textColor = color;
    label.lineBreakMode = NSLineBreakByTruncatingTail;
    label.maximumNumberOfLines = 1;
    return label;
}

static NSImage *SBSymbol(NSString *name, CGFloat size, NSFontWeight weight) {
    if (@available(macOS 11.0, *)) {
        NSImage *image = [NSImage imageWithSystemSymbolName:name ?: @"circle"
                                  accessibilityDescription:nil];
        NSImageSymbolConfiguration *configuration =
            [NSImageSymbolConfiguration configurationWithPointSize:size weight:weight];
        return [image imageWithSymbolConfiguration:configuration];
    }
    return nil;
}

static NSURL *SBAccessibilityApplicationURL(void) {
    NSURL *url = NSBundle.mainBundle.bundleURL;
    if (url == nil || ![url.pathExtension.lowercaseString isEqualToString:@"app"] ||
        ![NSFileManager.defaultManager fileExistsAtPath:url.path]) {
        return nil;
    }
    return url;
}

static BOOL SBOpenAccessibilitySystemSettings(void) {
    NSURL *url = [NSURL URLWithString:
        @"x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"];
    return url != nil && [NSWorkspace.sharedWorkspace openURL:url];
}

static BOOL SBRequestAccessibilityPrompt(void) {
    if (AXIsProcessTrusted()) return YES;
    NSDictionary *options = @{
        (__bridge NSString *)kAXTrustedCheckOptionPrompt: @YES,
    };
    return AXIsProcessTrustedWithOptions((__bridge CFDictionaryRef)options);
}

static NSRect SBAppKitRectFromCGWindowRect(CGRect cgRect) {
    NSScreen *bestScreen = nil;
    CGRect bestDisplayBounds = CGRectZero;
    CGFloat bestArea = 0.0;
    for (NSScreen *screen in NSScreen.screens) {
        NSNumber *screenNumber = screen.deviceDescription[@"NSScreenNumber"];
        if (![screenNumber isKindOfClass:NSNumber.class]) continue;
        CGRect displayBounds = CGDisplayBounds((CGDirectDisplayID)screenNumber.unsignedIntValue);
        CGRect intersection = CGRectIntersection(displayBounds, cgRect);
        CGFloat area = CGRectIsNull(intersection)
            ? 0.0
            : NSWidth(intersection) * NSHeight(intersection);
        if (area > bestArea) {
            bestArea = area;
            bestScreen = screen;
            bestDisplayBounds = displayBounds;
        }
    }
    if (bestScreen == nil) return NSRectFromCGRect(cgRect);

    CGFloat localX = CGRectGetMinX(cgRect) - CGRectGetMinX(bestDisplayBounds);
    CGFloat localY = CGRectGetMinY(cgRect) - CGRectGetMinY(bestDisplayBounds);
    return NSMakeRect(NSMinX(bestScreen.frame) + localX,
                      NSMaxY(bestScreen.frame) - localY - CGRectGetHeight(cgRect),
                      CGRectGetWidth(cgRect), CGRectGetHeight(cgRect));
}

static NSRect SBAccessibilitySystemSettingsFrame(void) {
    NSArray<NSRunningApplication *> *settingsApps =
        [NSRunningApplication runningApplicationsWithBundleIdentifier:@"com.apple.systempreferences"];
    if (settingsApps.count == 0) return NSZeroRect;

    NSMutableSet<NSNumber *> *processes = [NSMutableSet set];
    for (NSRunningApplication *app in settingsApps) {
        [processes addObject:@(app.processIdentifier)];
    }
    CFArrayRef windowInfo = CGWindowListCopyWindowInfo(
        kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements,
        kCGNullWindowID);
    if (windowInfo == NULL) return NSZeroRect;
    NSArray<NSDictionary *> *windows = CFBridgingRelease(windowInfo);
    NSRect bestFrame = NSZeroRect;
    CGFloat bestArea = 0.0;
    for (NSDictionary *info in windows) {
        NSNumber *ownerPID = info[(__bridge NSString *)kCGWindowOwnerPID];
        NSNumber *layer = info[(__bridge NSString *)kCGWindowLayer];
        NSDictionary *bounds = info[(__bridge NSString *)kCGWindowBounds];
        if (![processes containsObject:ownerPID] || layer.integerValue != 0 ||
            ![bounds isKindOfClass:NSDictionary.class]) continue;
        CGRect cgFrame = CGRectZero;
        if (!CGRectMakeWithDictionaryRepresentation((__bridge CFDictionaryRef)bounds,
                                                     &cgFrame) ||
            cgFrame.size.width < 200.0 || cgFrame.size.height < 200.0) continue;
        CGFloat area = cgFrame.size.width * cgFrame.size.height;
        if (area > bestArea) {
            bestArea = area;
            bestFrame = SBAppKitRectFromCGWindowRect(cgFrame);
        }
    }
    return bestFrame;
}

@implementation SBAccessibilityGuidePanel
- (BOOL)canBecomeKeyWindow { return NO; }
- (BOOL)canBecomeMainWindow { return NO; }
@end

@implementation SBAccessibilityDragView
- (instancetype)initWithAppURL:(NSURL *)appURL {
    self = [super initWithFrame:NSZeroRect];
    if (self == nil) return nil;
    self.appURL = appURL;
    self.appIcon = appURL != nil
        ? [NSWorkspace.sharedWorkspace iconForFile:appURL.path]
        : NSApplication.sharedApplication.applicationIconImage;
    self.translatesAutoresizingMaskIntoConstraints = NO;

    NSImageView *iconView = [[NSImageView alloc] initWithFrame:NSZeroRect];
    iconView.translatesAutoresizingMaskIntoConstraints = NO;
    iconView.image = self.appIcon;
    iconView.imageScaling = NSImageScaleProportionallyUpOrDown;
    iconView.accessibilityElement = NO;
    [self addSubview:iconView];

    self.nameLabel = SBLabel(@"OneTouch",
        [NSFont systemFontOfSize:16.0 weight:NSFontWeightSemibold], NSColor.labelColor);
    self.nameLabel.translatesAutoresizingMaskIntoConstraints = NO;
    self.hintLabel = SBLabel(@"拖入辅助功能列表",
        [NSFont systemFontOfSize:14.0 weight:NSFontWeightRegular],
        NSColor.secondaryLabelColor);
    self.hintLabel.translatesAutoresizingMaskIntoConstraints = NO;
    NSStackView *labels = [NSStackView stackViewWithViews:@[self.nameLabel, self.hintLabel]];
    labels.translatesAutoresizingMaskIntoConstraints = NO;
    labels.orientation = NSUserInterfaceLayoutOrientationVertical;
    labels.alignment = NSLayoutAttributeLeading;
    labels.spacing = 2.0;
    [self addSubview:labels];

    [NSLayoutConstraint activateConstraints:@[
        [iconView.leadingAnchor constraintEqualToAnchor:self.leadingAnchor constant:16.0],
        [iconView.centerYAnchor constraintEqualToAnchor:self.centerYAnchor],
        [iconView.widthAnchor constraintEqualToConstant:48.0],
        [iconView.heightAnchor constraintEqualToConstant:48.0],
        [labels.leadingAnchor constraintEqualToAnchor:iconView.trailingAnchor constant:14.0],
        [labels.centerYAnchor constraintEqualToAnchor:self.centerYAnchor],
        [labels.trailingAnchor constraintLessThanOrEqualToAnchor:self.trailingAnchor
                                                         constant:-16.0],
    ]];

    self.accessibilityElement = YES;
    self.accessibilityRole = NSAccessibilityButtonRole;
    return self;
}

- (void)drawRect:(NSRect)dirtyRect {
    [super drawRect:dirtyRect];
    NSRect borderRect = NSInsetRect(self.bounds, 0.5, 0.5);
    NSBezierPath *path = [NSBezierPath bezierPathWithRoundedRect:borderRect
                                                         xRadius:12.0
                                                         yRadius:12.0];
    [NSColor.controlBackgroundColor setFill];
    [path fill];
    if (self.pressed) {
        [NSColor.unemphasizedSelectedContentBackgroundColor setFill];
        [path fill];
    }
    [NSColor.quaternaryLabelColor setStroke];
    path.lineWidth = 1.0;
    [path stroke];
}

- (void)viewDidChangeEffectiveAppearance {
    [super viewDidChangeEffectiveAppearance];
    [self setNeedsDisplay:YES];
}

- (BOOL)acceptsFirstMouse:(NSEvent *)event {
    (void)event;
    return YES;
}

- (void)updateName:(NSString *)name hint:(NSString *)hint fallback:(NSString *)fallback {
    self.nameLabel.stringValue = name.length > 0 ? name : @"OneTouch";
    self.hintLabel.stringValue = self.appURL != nil ? (hint ?: @"") : (fallback ?: @"");
    self.accessibilityLabel = self.nameLabel.stringValue;
    self.accessibilityHelp = self.hintLabel.stringValue;
}

- (void)resetCursorRects {
    [super resetCursorRects];
    if (self.appURL != nil) [self addCursorRect:self.bounds cursor:NSCursor.openHandCursor];
}

- (void)mouseDown:(NSEvent *)event {
    self.mouseDownLocation = [self convertPoint:event.locationInWindow fromView:nil];
    self.dragStarted = NO;
    self.pressed = self.appURL != nil;
    [self setNeedsDisplay:YES];
}

- (void)mouseDragged:(NSEvent *)event {
    if (self.appURL == nil || self.dragStarted) return;
    NSPoint current = [self convertPoint:event.locationInWindow fromView:nil];
    CGFloat distance = hypot(current.x - self.mouseDownLocation.x,
                             current.y - self.mouseDownLocation.y);
    if (distance < 8.0) return;
    self.dragStarted = YES;
    self.pressed = NO;
    [self setNeedsDisplay:YES];

    NSBitmapImageRep *representation = [self bitmapImageRepForCachingDisplayInRect:self.bounds];
    [self cacheDisplayInRect:self.bounds toBitmapImageRep:representation];
    NSImage *snapshot = [[NSImage alloc] initWithSize:self.bounds.size];
    if (representation != nil) [snapshot addRepresentation:representation];

    NSDraggingItem *item = [[NSDraggingItem alloc] initWithPasteboardWriter:self.appURL];
    [item setDraggingFrame:self.bounds contents:snapshot];
    NSDraggingSession *session = [self beginDraggingSessionWithItems:@[item]
                                                               event:event
                                                              source:self];
    session.animatesToStartingPositionsOnCancelOrFail = YES;
}

- (void)mouseUp:(NSEvent *)event {
    (void)event;
    self.dragStarted = NO;
    self.pressed = NO;
    [self setNeedsDisplay:YES];
}

- (NSDragOperation)draggingSession:(NSDraggingSession *)session
 sourceOperationMaskForDraggingContext:(NSDraggingContext)context {
    (void)session;
    return context == NSDraggingContextOutsideApplication ? NSDragOperationCopy : NSDragOperationNone;
}

- (void)draggingSession:(NSDraggingSession *)session willBeginAtPoint:(NSPoint)screenPoint {
    (void)session;
    (void)screenPoint;
    if (self.draggingChanged != nil) self.draggingChanged(YES);
}

- (void)draggingSession:(NSDraggingSession *)session
            endedAtPoint:(NSPoint)screenPoint
               operation:(NSDragOperation)operation {
    (void)session;
    (void)screenPoint;
    (void)operation;
    self.dragStarted = NO;
    self.pressed = NO;
    [self setNeedsDisplay:YES];
    if (self.draggingChanged != nil) self.draggingChanged(NO);
}
@end

@implementation SBAccessibilityGuideController
static const CGFloat SBAccessibilityGuideWidth = 420.0;
static const CGFloat SBAccessibilityGuideHeight = 242.0;

- (instancetype)init {
    self = [super init];
    if (self == nil) return nil;
    self.model = @{
        @"title": @"开启辅助功能权限",
        @"explanation": @"只需授权一次，之后使用 OneTouch 控制时不会再被打断。",
        @"privacy": @"仅执行你主动选择的控制，不会记录或上传键盘内容。",
        @"appName": @"OneTouch",
        @"dragHint": @"拖入辅助功能列表",
        @"fallback": @"请使用 + 选择 OneTouch.app",
        @"close": @"关闭",
        @"quit": @"退出 OneTouch",
        @"successTitle": @"辅助功能已开启",
        @"successStatus": @"OneTouch 已准备就绪。",
    };
    [self buildPanel];
    self.lastKnownTrusted = AXIsProcessTrusted();
    self.permissionTimer = [NSTimer timerWithTimeInterval:0.5
                                                  target:self
                                                selector:@selector(permissionTick:)
                                                userInfo:nil
                                                 repeats:YES];
    [NSRunLoop.mainRunLoop addTimer:self.permissionTimer
                            forMode:NSRunLoopCommonModes];
    return self;
}

- (void)buildPanel {
    self.panel = [[SBAccessibilityGuidePanel alloc]
        initWithContentRect:NSMakeRect(0, 0, SBAccessibilityGuideWidth,
                                      SBAccessibilityGuideHeight)
                  styleMask:NSWindowStyleMaskTitled |
                            NSWindowStyleMaskFullSizeContentView |
                            NSWindowStyleMaskNonactivatingPanel
                    backing:NSBackingStoreBuffered
                      defer:NO];
    self.panel.floatingPanel = YES;
    self.panel.level = NSFloatingWindowLevel;
    self.panel.hidesOnDeactivate = NO;
    self.panel.opaque = NO;
    self.panel.backgroundColor = NSColor.clearColor;
    self.panel.hasShadow = YES;
    self.panel.releasedWhenClosed = NO;
    self.panel.excludedFromWindowsMenu = YES;
    self.panel.collectionBehavior = NSWindowCollectionBehaviorCanJoinAllSpaces |
        NSWindowCollectionBehaviorFullScreenAuxiliary |
        NSWindowCollectionBehaviorTransient |
        NSWindowCollectionBehaviorIgnoresCycle;
    self.panel.animationBehavior = NSWindowAnimationBehaviorNone;
    self.panel.title = @"OneTouch";
    self.panel.titleVisibility = NSWindowTitleHidden;
    self.panel.titlebarAppearsTransparent = YES;
    [self.panel standardWindowButton:NSWindowCloseButton].hidden = YES;
    [self.panel standardWindowButton:NSWindowMiniaturizeButton].hidden = YES;
    [self.panel standardWindowButton:NSWindowZoomButton].hidden = YES;
    if (@available(macOS 11.0, *)) {
        self.panel.titlebarSeparatorStyle = NSTitlebarSeparatorStyleNone;
    }

    NSRect frame = NSMakeRect(0, 0, SBAccessibilityGuideWidth,
                              SBAccessibilityGuideHeight);
    if (@available(macOS 26.0, *)) {
        NSGlassEffectView *glass = [[NSGlassEffectView alloc] initWithFrame:frame];
        glass.style = NSGlassEffectViewStyleRegular;
        glass.tintColor = nil;
        NSView *content = [[NSView alloc] initWithFrame:frame];
        content.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
        glass.contentView = content;
        self.contentHostView = content;
        self.panel.contentView = glass;
    } else {
        NSVisualEffectView *effect = [[NSVisualEffectView alloc] initWithFrame:frame];
        effect.material = NSVisualEffectMaterialPopover;
        effect.blendingMode = NSVisualEffectBlendingModeBehindWindow;
        effect.state = NSVisualEffectStateActive;
        self.contentHostView = effect;
        self.panel.contentView = effect;
    }

    self.closeButton = [NSButton buttonWithImage:SBSymbol(@"xmark", 10.0,
                                                           NSFontWeightMedium)
                                           target:self
                                           action:@selector(closePressed:)];
    self.closeButton.translatesAutoresizingMaskIntoConstraints = NO;
    self.closeButton.bezelStyle = NSBezelStyleAccessoryBarAction;
    self.closeButton.imagePosition = NSImageOnly;
    self.closeButton.showsBorderOnlyWhileMouseInside = YES;
    [self.contentHostView addSubview:self.closeButton];

    self.titleLabel = SBLabel(self.model[@"title"],
        [NSFont systemFontOfSize:16.0 weight:NSFontWeightSemibold], NSColor.labelColor);
    self.titleLabel.translatesAutoresizingMaskIntoConstraints = NO;
    [self.contentHostView addSubview:self.titleLabel];

    self.explanationLabel = SBLabel(self.model[@"explanation"],
        [NSFont systemFontOfSize:13.0 weight:NSFontWeightRegular],
        NSColor.secondaryLabelColor);
    self.explanationLabel.translatesAutoresizingMaskIntoConstraints = NO;
    self.explanationLabel.lineBreakMode = NSLineBreakByWordWrapping;
    self.explanationLabel.maximumNumberOfLines = 2;
    [self.contentHostView addSubview:self.explanationLabel];

    self.dragView = [[SBAccessibilityDragView alloc]
        initWithAppURL:SBAccessibilityApplicationURL()];
    __weak SBAccessibilityGuideController *weakSelf = self;
    self.dragView.draggingChanged = ^(BOOL dragging) {
        SBAccessibilityGuideController *strongSelf = weakSelf;
        if (strongSelf == nil) return;
        strongSelf.panel.ignoresMouseEvents = dragging;
        if (dragging) {
            [strongSelf.panel orderBack:nil];
        } else if (strongSelf.panel.isVisible) {
            [strongSelf.panel orderFrontRegardless];
        }
    };
    [self.contentHostView addSubview:self.dragView];

    self.successIcon = [[NSImageView alloc] initWithFrame:NSZeroRect];
    self.successIcon.translatesAutoresizingMaskIntoConstraints = NO;
    self.successIcon.image = SBSymbol(@"checkmark.circle.fill", 34.0,
                                      NSFontWeightRegular);
    self.successIcon.contentTintColor = NSColor.systemGreenColor;
    self.successIcon.hidden = YES;
    self.successIcon.accessibilityLabel = self.model[@"successTitle"];
    [self.contentHostView addSubview:self.successIcon];

    self.successStatusLabel = SBLabel(self.model[@"successStatus"],
        [NSFont systemFontOfSize:13.0 weight:NSFontWeightRegular],
        NSColor.secondaryLabelColor);
    self.successStatusLabel.translatesAutoresizingMaskIntoConstraints = NO;
    self.successStatusLabel.alignment = NSTextAlignmentCenter;
    self.successStatusLabel.hidden = YES;
    [self.contentHostView addSubview:self.successStatusLabel];

    self.privacyLabel = SBLabel(self.model[@"privacy"],
        [NSFont systemFontOfSize:11.0 weight:NSFontWeightRegular],
        NSColor.secondaryLabelColor);
    self.privacyLabel.translatesAutoresizingMaskIntoConstraints = NO;
    self.privacyLabel.lineBreakMode = NSLineBreakByWordWrapping;
    self.privacyLabel.maximumNumberOfLines = 2;
    [self.contentHostView addSubview:self.privacyLabel];

    self.quitButton = [NSButton buttonWithTitle:self.model[@"quit"] ?: @""
                                          target:self
                                          action:@selector(quitPressed:)];
    self.quitButton.translatesAutoresizingMaskIntoConstraints = NO;
    self.quitButton.bezelStyle = NSBezelStyleRounded;
    self.quitButton.controlSize = NSControlSizeSmall;
    [self.contentHostView addSubview:self.quitButton];

    [NSLayoutConstraint activateConstraints:@[
        [self.closeButton.topAnchor constraintEqualToAnchor:self.contentHostView.topAnchor constant:9.0],
        [self.closeButton.trailingAnchor constraintEqualToAnchor:self.contentHostView.trailingAnchor
                                                         constant:-9.0],
        [self.closeButton.widthAnchor constraintEqualToConstant:24.0],
        [self.closeButton.heightAnchor constraintEqualToConstant:24.0],
        [self.titleLabel.leadingAnchor constraintEqualToAnchor:self.contentHostView.leadingAnchor
                                                       constant:20.0],
        [self.titleLabel.topAnchor constraintEqualToAnchor:self.contentHostView.topAnchor
                                                   constant:20.0],
        [self.titleLabel.trailingAnchor constraintLessThanOrEqualToAnchor:self.closeButton.leadingAnchor
                                                                 constant:-8.0],
        [self.explanationLabel.leadingAnchor constraintEqualToAnchor:self.titleLabel.leadingAnchor],
        [self.explanationLabel.trailingAnchor constraintEqualToAnchor:self.contentHostView.trailingAnchor
                                                               constant:-20.0],
        [self.explanationLabel.topAnchor constraintEqualToAnchor:self.titleLabel.bottomAnchor
                                                          constant:8.0],
        [self.dragView.leadingAnchor constraintEqualToAnchor:self.contentHostView.leadingAnchor
                                                     constant:20.0],
        [self.dragView.trailingAnchor constraintEqualToAnchor:self.contentHostView.trailingAnchor
                                                      constant:-20.0],
        [self.dragView.topAnchor constraintEqualToAnchor:self.explanationLabel.bottomAnchor
                                                  constant:14.0],
        [self.dragView.heightAnchor constraintEqualToConstant:68.0],
        [self.privacyLabel.leadingAnchor constraintEqualToAnchor:self.contentHostView.leadingAnchor
                                                         constant:20.0],
        [self.privacyLabel.topAnchor constraintEqualToAnchor:self.dragView.bottomAnchor
                                                     constant:12.0],
        [self.privacyLabel.trailingAnchor constraintLessThanOrEqualToAnchor:self.quitButton.leadingAnchor
                                                                    constant:-12.0],
        [self.privacyLabel.bottomAnchor constraintLessThanOrEqualToAnchor:self.contentHostView.bottomAnchor
                                                                  constant:-16.0],
        [self.quitButton.trailingAnchor constraintEqualToAnchor:self.contentHostView.trailingAnchor
                                                        constant:-20.0],
        [self.quitButton.bottomAnchor constraintEqualToAnchor:self.contentHostView.bottomAnchor
                                                      constant:-16.0],
        [self.successIcon.centerXAnchor constraintEqualToAnchor:self.contentHostView.centerXAnchor],
        [self.successIcon.centerYAnchor constraintEqualToAnchor:self.contentHostView.centerYAnchor
                                                       constant:-8.0],
        [self.successIcon.widthAnchor constraintEqualToConstant:48.0],
        [self.successIcon.heightAnchor constraintEqualToConstant:48.0],
        [self.successStatusLabel.topAnchor constraintEqualToAnchor:self.successIcon.bottomAnchor
                                                           constant:10.0],
        [self.successStatusLabel.centerXAnchor constraintEqualToAnchor:self.contentHostView.centerXAnchor],
        [self.successStatusLabel.leadingAnchor constraintGreaterThanOrEqualToAnchor:self.contentHostView.leadingAnchor
                                                                            constant:20.0],
        [self.successStatusLabel.trailingAnchor constraintLessThanOrEqualToAnchor:self.contentHostView.trailingAnchor
                                                                           constant:-20.0],
    ]];
    [self applyCurrentModel];
}

- (void)applyCurrentModel {
    if (self.showingSuccess) return;
    self.titleLabel.stringValue = self.model[@"title"] ?: @"";
    self.explanationLabel.stringValue = self.model[@"explanation"] ?: @"";
    self.privacyLabel.stringValue = self.model[@"privacy"] ?: @"";
    self.closeButton.toolTip = self.model[@"close"] ?: @"";
    self.closeButton.accessibilityLabel = self.closeButton.toolTip;
    self.quitButton.title = self.model[@"quit"] ?: @"";
    self.quitButton.accessibilityLabel = self.quitButton.title;
    [self.dragView updateName:self.model[@"appName"]
                         hint:self.model[@"dragHint"]
                     fallback:self.model[@"fallback"]];
    self.dragView.hidden = NO;
    self.explanationLabel.hidden = NO;
    self.privacyLabel.hidden = NO;
    self.quitButton.hidden = NO;
    self.successIcon.hidden = YES;
    self.successStatusLabel.hidden = YES;
}

- (void)updateModel:(NSDictionary *)model {
    if (![model isKindOfClass:NSDictionary.class]) return;
    self.model = model;
    [self applyCurrentModel];
    BOOL shouldAutoShow = !self.handledInitialModel && [model[@"autoShow"] boolValue];
    self.handledInitialModel = YES;
    if (shouldAutoShow && !AXIsProcessTrusted()) {
        [self showOpeningSystemSettings:YES];
    }
}

- (void)showOpeningSystemSettings:(BOOL)openSettings {
    if (AXIsProcessTrusted()) {
        [self hide];
        return;
    }
    SBHideNativePopover(NO);
    self.showingSuccess = NO;
    [self applyCurrentModel];
    self.sawSystemSettings = NO;
    NSScreen *screen = NSScreen.mainScreen;
    if (screen != nil) {
        NSRect visible = screen.visibleFrame;
        NSPoint origin = NSMakePoint(NSMaxX(visible) - SBAccessibilityGuideWidth - 24.0,
                                    NSMaxY(visible) - SBAccessibilityGuideHeight - 24.0);
        [self.panel setFrameOrigin:origin];
    }
    [self.panel orderFrontRegardless];
    if (openSettings) {
        // Register this exact signed app with TCC before opening the matching
        // settings pane. The prompt is only requested from an explicit
        // onboarding/recovery action, never from the background polling timer.
        SBRequestAccessibilityPrompt();
        SBOpenAccessibilitySystemSettings();
    }
    [self startTracking];
}

- (void)startTracking {
    [self.trackingTimer invalidate];
    self.trackingTimer = [NSTimer scheduledTimerWithTimeInterval:0.15
                                                          target:self
                                                        selector:@selector(trackingTick:)
                                                        userInfo:nil
                                                         repeats:YES];
    [self trackingTick:self.trackingTimer];
}

- (void)permissionTick:(NSTimer *)timer {
    (void)timer;
    BOOL trusted = AXIsProcessTrusted();
    if (trusted) {
        if (!self.lastKnownTrusted && self.panel.isVisible && !self.showingSuccess) {
            [self showSuccess];
        }
    } else if (self.lastKnownTrusted) {
        SBHideNativePopover(NO);
        [self hide];
    }
    self.lastKnownTrusted = trusted;
}

- (void)trackingTick:(NSTimer *)timer {
    (void)timer;
    NSArray *settingsApps =
        [NSRunningApplication runningApplicationsWithBundleIdentifier:@"com.apple.systempreferences"];
    if (settingsApps.count == 0) {
        if (self.sawSystemSettings) [self hide];
        return;
    }
    self.sawSystemSettings = YES;
    NSRect settingsFrame = SBAccessibilitySystemSettingsFrame();
    if (NSEqualRects(settingsFrame, NSZeroRect)) return;
    [self positionNextToSystemSettings:settingsFrame];
}

- (void)positionNextToSystemSettings:(NSRect)settingsFrame {
    NSScreen *screen = nil;
    CGFloat bestArea = 0.0;
    for (NSScreen *candidate in NSScreen.screens) {
        NSRect intersection = NSIntersectionRect(candidate.frame, settingsFrame);
        CGFloat area = NSWidth(intersection) * NSHeight(intersection);
        if (area > bestArea) {
            bestArea = area;
            screen = candidate;
        }
    }
    screen = screen ?: NSScreen.mainScreen;
    if (screen == nil) return;
    NSRect visible = screen.visibleFrame;
    const CGFloat gap = 8.0;
    CGFloat rightSpace = NSMaxX(visible) - NSMaxX(settingsFrame);
    CGFloat bottomSpace = NSMinY(settingsFrame) - NSMinY(visible);
    NSPoint origin;
    if (rightSpace >= SBAccessibilityGuideWidth + gap) {
        origin.x = NSMaxX(settingsFrame) + gap;
        origin.y = NSMaxY(settingsFrame) - SBAccessibilityGuideHeight;
    } else if (bottomSpace >= SBAccessibilityGuideHeight + gap) {
        origin.x = NSMaxX(settingsFrame) - SBAccessibilityGuideWidth;
        origin.y = NSMinY(settingsFrame) - SBAccessibilityGuideHeight - gap;
    } else {
        origin.x = NSMaxX(settingsFrame) - SBAccessibilityGuideWidth - 18.0;
        origin.y = NSMinY(settingsFrame) + 18.0;
    }
    origin.x = MIN(MAX(origin.x, NSMinX(visible)),
                   NSMaxX(visible) - SBAccessibilityGuideWidth);
    origin.y = MIN(MAX(origin.y, NSMinY(visible)),
                   NSMaxY(visible) - SBAccessibilityGuideHeight);
    origin.x = round(origin.x);
    origin.y = round(origin.y);
    if (NSEqualPoints(self.panel.frame.origin, origin)) return;
    if (NSWorkspace.sharedWorkspace.accessibilityDisplayShouldReduceMotion) {
        [self.panel setFrameOrigin:origin];
    } else {
        [NSAnimationContext runAnimationGroup:^(NSAnimationContext *context) {
            context.duration = 0.12;
            context.allowsImplicitAnimation = YES;
            [self.panel.animator setFrameOrigin:origin];
        } completionHandler:nil];
    }
}

- (void)showSuccess {
    if (self.showingSuccess) return;
    self.showingSuccess = YES;
    [self.trackingTimer invalidate];
    self.trackingTimer = nil;
    self.titleLabel.stringValue = self.model[@"successTitle"] ?: @"";
    self.explanationLabel.hidden = YES;
    self.dragView.hidden = YES;
    self.privacyLabel.hidden = YES;
    self.quitButton.hidden = YES;
    self.successIcon.accessibilityLabel = self.titleLabel.stringValue;
    self.successIcon.hidden = NO;
    self.successStatusLabel.stringValue = self.model[@"successStatus"] ?: @"";
    self.successStatusLabel.hidden = NO;
    if (!NSWorkspace.sharedWorkspace.accessibilityDisplayShouldReduceMotion) {
        self.successIcon.alphaValue = 0.0;
        [NSAnimationContext runAnimationGroup:^(NSAnimationContext *context) {
            context.duration = 0.18;
            self.successIcon.animator.alphaValue = 1.0;
        } completionHandler:nil];
    }
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.8 * NSEC_PER_SEC)),
                   dispatch_get_main_queue(), ^{
        if (!self.showingSuccess) return;
        [self hide];
        SBShowNativePopover(NO);
    });
}

- (void)hide {
    [self.trackingTimer invalidate];
    self.trackingTimer = nil;
    self.sawSystemSettings = NO;
    self.showingSuccess = NO;
    self.panel.ignoresMouseEvents = NO;
    [self.panel orderOut:nil];
    [self applyCurrentModel];
}

- (void)closePressed:(id)sender {
    (void)sender;
    [self hide];
}

- (void)quitPressed:(id)sender {
    (void)sender;
    [NSApp terminate:nil];
}

@end

// OneTouch native layout contract. Row controls always occupy a dedicated
// trailing column, while the footer uses fixed side actions and a flexible
// centre action so all three buttons share one native interaction style.
static const CGFloat SBNativePopoverWidth = 360.0;
static const CGFloat SBNativeHeaderHeight = 58.0;
static const CGFloat SBNativeRowHeight = 55.0;
static const CGFloat SBNativeFooterHeight = 58.0;
static const CGFloat SBNativeSeparatorHeight = 1.0;
static const NSUInteger SBNativeVisibleRowCapacity = 8;
static const CGFloat SBNativeSideInset = 16.0;
static const CGFloat SBNativeControlColumnWidth = 64.0;
static const CGFloat SBNativeFooterIconButtonWidth = 44.0;
static const CGFloat SBNativeFooterButtonHeight = 32.0;

static void SBPositionNativePopoverPanel(void) {
    NSButton *button = SBStatusItem.button;
    NSWindow *statusWindow = button.window;
    if (SBNativePopoverPanel == nil || button == nil || statusWindow == nil) return;

    NSRect anchorFrame = [statusWindow convertRectToScreen:button.frame];
    NSScreen *screen = statusWindow.screen ?: NSScreen.mainScreen;
    if (screen == nil) return;

    NSRect panelFrame = SBNativePopoverPanel.frame;
    NSRect usableFrame = screen.visibleFrame;
    CGFloat x = NSMidX(anchorFrame) - NSWidth(panelFrame) / 2.0;
    // The status item's lower edge is the menu bar's lower edge. Using it
    // directly keeps the panel flush with the menu bar without a guessed gap.
    CGFloat top = NSMinY(anchorFrame);
    x = MIN(MAX(x, NSMinX(usableFrame)), NSMaxX(usableFrame) - NSWidth(panelFrame));
    top = MIN(top, NSMaxY(usableFrame));
    top = MAX(top, NSMinY(usableFrame) + NSHeight(panelFrame));
    [SBNativePopoverPanel setFrameTopLeftPoint:NSMakePoint(round(x), round(top))];
}

static void SBInstallNativePopoverEventMonitors(void) {
    if (SBNativePopoverLocalEventMonitor == nil) {
        NSEventMask mask = NSEventMaskLeftMouseDown |
                           NSEventMaskRightMouseDown |
                           NSEventMaskOtherMouseDown |
                           NSEventMaskKeyDown;
        SBNativePopoverLocalEventMonitor =
            [NSEvent addLocalMonitorForEventsMatchingMask:mask
                                                   handler:^NSEvent *(NSEvent *event) {
                if (SBNativePopoverPanel == nil || !SBNativePopoverPanel.isVisible) {
                    return event;
                }
                if (event.type == NSEventTypeKeyDown && event.keyCode == 53) {
                    SBHideNativePopover(YES);
                    return nil;
                }
                if (event.type != NSEventTypeKeyDown && !SBNativePopoverPersistent) {
                    NSWindow *eventWindow = event.window;
                    NSWindow *statusWindow = SBStatusItem.button.window;
                    BOOL belongsToOpenMenu = eventWindow.level == NSPopUpMenuWindowLevel;
                    if (eventWindow != SBNativePopoverPanel &&
                        eventWindow != statusWindow &&
                        !belongsToOpenMenu) {
                        SBHideNativePopover(NO);
                    }
                }
                return event;
            }];
    }

    if (SBNativePopoverGlobalEventMonitor == nil) {
        NSEventMask mask = NSEventMaskLeftMouseDown |
                           NSEventMaskRightMouseDown |
                           NSEventMaskOtherMouseDown;
        SBNativePopoverGlobalEventMonitor =
            [NSEvent addGlobalMonitorForEventsMatchingMask:mask handler:^(NSEvent *event) {
                (void)event;
                dispatch_async(dispatch_get_main_queue(), ^{
                    if (SBNativePopoverPanel.isVisible && !SBNativePopoverPersistent) {
                        SBHideNativePopover(NO);
                    }
                });
            }];
    }
}

static void SBShowNativePopover(BOOL persistent) {
    NSButton *button = SBStatusItem.button;
    if (SBNativePopoverPanel == nil || SBNativePopoverPanel.isVisible || button == nil) return;

    SBNativePopoverPersistent = persistent;
    SBActivateForNativePopover();
    SBPositionNativePopoverPanel();
    [SBNativePopoverPanel makeKeyAndOrderFront:nil];
}

static void SBHideNativePopover(BOOL restorePreviousApplication) {
    if (SBNativePopoverPanel == nil || !SBNativePopoverPanel.isVisible) return;
    SBNativePopoverPersistent = NO;
    [SBNativePopoverPanel orderOut:nil];
    if (restorePreviousApplication) {
        SBRestorePreviousApplicationAfterPopover();
    } else {
        SBPreviousFrontmostApplication = nil;
    }
}

@implementation SBNativePopoverPanelWindow
- (BOOL)canBecomeKeyWindow {
    return YES;
}
- (BOOL)canBecomeMainWindow {
    return NO;
}
@end

@implementation SBNativeRowsDocumentView
- (BOOL)isFlipped {
    return YES;
}
@end

@implementation SBNativePopoverController
- (instancetype)init {
    self = [super init];
    if (self != nil) {
        _controlTargets = [NSMutableArray array];
        _rowBindings = [NSMutableDictionary dictionary];
    }
    return self;
}

- (void)loadView {
    NSRect initialFrame = NSMakeRect(0, 0, SBNativePopoverWidth, 560);
    if (@available(macOS 26.0, *)) {
        // Control Center surfaces on current macOS use AppKit's dynamic glass.
        // Keep the standard regular style and its untinted system appearance;
        // the contentView is the only supported place for our controls.
        NSGlassEffectView *glass = [[NSGlassEffectView alloc] initWithFrame:initialFrame];
        glass.style = NSGlassEffectViewStyleRegular;
        glass.tintColor = nil;
        NSView *content = [[NSView alloc] initWithFrame:initialFrame];
        content.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
        glass.contentView = content;
        self.contentHostView = content;
        self.view = glass;
    } else {
        NSVisualEffectView *content = [[NSVisualEffectView alloc] initWithFrame:initialFrame];
        content.material = NSVisualEffectMaterialPopover;
        content.blendingMode = NSVisualEffectBlendingModeBehindWindow;
        content.state = NSVisualEffectStateActive;
        self.contentHostView = content;
        self.view = content;
    }
}

- (NSView *)headerView:(NSDictionary *)model {
    NSView *header = [NSView new];
    [header.heightAnchor constraintEqualToConstant:SBNativeHeaderHeight].active = YES;

    NSImageView *mark = [[NSImageView alloc] initWithFrame:NSZeroRect];
    mark.translatesAutoresizingMaskIntoConstraints = NO;
    mark.image = SBSingleSwitchTemplate(20.0);
    // Leave template rendering untinted so AppKit keeps the brand mark
    // legible across light, dark, glass, and accessibility appearances.
    mark.contentTintColor = nil;
    mark.imageScaling = NSImageScaleProportionallyDown;
    [header addSubview:mark];

    NSTextField *title = SBLabel(model[@"title"], [NSFont systemFontOfSize:15.0 weight:NSFontWeightMedium],
                                 NSColor.labelColor);
    NSTextField *subtitle = SBLabel(model[@"subtitle"], [NSFont systemFontOfSize:11.5 weight:NSFontWeightRegular],
                                    NSColor.secondaryLabelColor);
    NSStackView *copy = [NSStackView stackViewWithViews:@[title, subtitle]];
    copy.orientation = NSUserInterfaceLayoutOrientationVertical;
    copy.alignment = NSLayoutAttributeLeading;
    copy.spacing = 1.0;
    copy.translatesAutoresizingMaskIntoConstraints = NO;
    [header addSubview:copy];

    [NSLayoutConstraint activateConstraints:@[
        [mark.leadingAnchor constraintEqualToAnchor:header.leadingAnchor constant:SBNativeSideInset],
        [mark.centerYAnchor constraintEqualToAnchor:header.centerYAnchor],
        [mark.widthAnchor constraintEqualToConstant:28.0],
        [mark.heightAnchor constraintEqualToConstant:28.0],
        [copy.leadingAnchor constraintEqualToAnchor:mark.trailingAnchor constant:10.0],
        [copy.trailingAnchor constraintLessThanOrEqualToAnchor:header.trailingAnchor constant:-14.0],
        [copy.centerYAnchor constraintEqualToAnchor:header.centerYAnchor],
    ]];
    return header;
}

- (NSView *)groupSeparatorView {
    NSView *container = [NSView new];
    [container.heightAnchor constraintEqualToConstant:SBNativeSeparatorHeight].active = YES;

    NSBox *separator = [NSBox new];
    separator.translatesAutoresizingMaskIntoConstraints = NO;
    separator.boxType = NSBoxSeparator;
    [container addSubview:separator];
    [NSLayoutConstraint activateConstraints:@[
        [separator.leadingAnchor constraintEqualToAnchor:container.leadingAnchor
                                                 constant:SBNativeSideInset],
        [separator.trailingAnchor constraintEqualToAnchor:container.trailingAnchor
                                                  constant:-SBNativeSideInset],
        [separator.centerYAnchor constraintEqualToAnchor:container.centerYAnchor],
        [separator.heightAnchor constraintEqualToConstant:SBNativeSeparatorHeight],
    ]];
    return container;
}

- (NSView *)rowView:(NSDictionary *)row useChinese:(BOOL)useChinese {
    NSView *container = [NSView new];
    [container.heightAnchor constraintEqualToConstant:SBNativeRowHeight].active = YES;

    BOOL active = [row[@"checked"] boolValue];
    BOOL enabled = row[@"enabled"] == nil || [row[@"enabled"] boolValue];
    BOOL locked = [row[@"locked"] boolValue];
    BOOL pending = [row[@"pending"] boolValue];
    NSString *kind = row[@"kind"] ?: @"toggle";

    NSImageView *icon = [NSImageView new];
    icon.translatesAutoresizingMaskIntoConstraints = NO;
    icon.image = SBSymbol(row[@"symbol"], 16.0, NSFontWeightRegular);
    icon.imageScaling = NSImageScaleProportionallyDown;
    icon.contentTintColor = active ? NSColor.controlAccentColor : NSColor.secondaryLabelColor;
    [container addSubview:icon];

    NSTextField *title = SBLabel(row[@"title"], [NSFont systemFontOfSize:NSFont.systemFontSize
                                                                 weight:NSFontWeightRegular],
                                 enabled ? NSColor.labelColor : NSColor.tertiaryLabelColor);
    NSColor *statusColor = [row[@"error"] boolValue] ? NSColor.systemRedColor
                                                     : (enabled ? NSColor.secondaryLabelColor : NSColor.tertiaryLabelColor);
    NSTextField *status = SBLabel(row[@"status"], [NSFont systemFontOfSize:NSFont.smallSystemFontSize
                                                                   weight:NSFontWeightRegular],
                                  statusColor);
    NSStackView *copy = [NSStackView stackViewWithViews:@[title, status]];
    copy.orientation = NSUserInterfaceLayoutOrientationVertical;
    copy.alignment = NSLayoutAttributeLeading;
    copy.spacing = 1.0;
    copy.translatesAutoresizingMaskIntoConstraints = NO;
    [container addSubview:copy];

    NSView *controlColumn = [NSView new];
    controlColumn.translatesAutoresizingMaskIntoConstraints = NO;
    [container addSubview:controlColumn];

    NSControl *affordance = nil;
    SBNativeControlTarget *target = [SBNativeControlTarget new];
    if ([kind isEqualToString:@"toggle"] || [kind isEqualToString:@"action"]) {
        NSSwitch *toggle = [NSSwitch new];
        BOOL momentary = [kind isEqualToString:@"action"];
        toggle.state = active ? NSControlStateValueOn : NSControlStateValueOff;
        toggle.enabled = enabled && !pending && !locked;
        toggle.controlSize = NSControlSizeSmall;
        target.controlID = row[@"id"] ?: @"";
        target.actionName = momentary ? @"activate" : @"toggle";
        target.timed = !momentary && [row[@"timed"] boolValue] && !active;
        target.useChinese = useChinese;
        target.control = toggle;
        toggle.target = target;
        toggle.action = @selector(performControlAction:);
        [self.controlTargets addObject:target];
        affordance = toggle;
    } else {
        NSButton *button = [NSButton buttonWithTitle:row[@"actionLabel"] ?: @""
                                              target:nil
                                              action:nil];
        button.bezelStyle = NSBezelStyleRounded;
        button.controlSize = NSControlSizeSmall;
        button.enabled = enabled && !pending && !locked;
        button.font = [NSFont systemFontOfSize:12.0 weight:NSFontWeightMedium];
        target.controlID = row[@"id"] ?: @"";
        target.actionName = @"activate";
        target.control = button;
        button.target = target;
        button.action = @selector(performControlAction:);
        [self.controlTargets addObject:target];
        affordance = button;
    }

    affordance.translatesAutoresizingMaskIntoConstraints = NO;
    affordance.toolTip = [NSString stringWithFormat:@"%@：%@", row[@"title"] ?: @"", row[@"status"] ?: @""];
    [controlColumn addSubview:affordance];

    [NSLayoutConstraint activateConstraints:@[
        [icon.leadingAnchor constraintEqualToAnchor:container.leadingAnchor constant:SBNativeSideInset],
        [icon.centerYAnchor constraintEqualToAnchor:container.centerYAnchor],
        [icon.widthAnchor constraintEqualToConstant:24.0],
        [icon.heightAnchor constraintEqualToConstant:24.0],
        [copy.leadingAnchor constraintEqualToAnchor:icon.trailingAnchor constant:10.0],
        [copy.centerYAnchor constraintEqualToAnchor:container.centerYAnchor],
        [copy.trailingAnchor constraintLessThanOrEqualToAnchor:controlColumn.leadingAnchor constant:-10.0],
        [controlColumn.trailingAnchor constraintEqualToAnchor:container.trailingAnchor constant:-SBNativeSideInset],
        [controlColumn.centerYAnchor constraintEqualToAnchor:container.centerYAnchor],
        [controlColumn.widthAnchor constraintEqualToConstant:SBNativeControlColumnWidth],
        [controlColumn.heightAnchor constraintEqualToConstant:44.0],
        [affordance.centerYAnchor constraintEqualToAnchor:controlColumn.centerYAnchor],
        [affordance.trailingAnchor constraintEqualToAnchor:controlColumn.trailingAnchor],
    ]];
    NSString *controlID = row[@"id"] ?: @"";
    if (controlID.length > 0) {
        self.rowBindings[controlID] = @{
            @"icon": icon,
            @"title": title,
            @"status": status,
            @"affordance": affordance,
            @"target": target,
            @"kind": kind,
        };
    }
    return container;
}

- (NSView *)footerView:(NSDictionary *)model {
    NSView *footer = [NSView new];
    [footer.heightAnchor constraintEqualToConstant:SBNativeFooterHeight].active = YES;

    NSButton *settings = [[NSButton alloc] initWithFrame:NSZeroRect];
    settings.image = SBSymbol(@"slider.horizontal.3", 15.0, NSFontWeightRegular);
    settings.imagePosition = NSImageOnly;
    settings.bezelStyle = NSBezelStyleAccessoryBarAction;
    settings.controlSize = NSControlSizeRegular;
    settings.toolTip = model[@"settingsLabel"] ?: @"Settings";

    NSButton *customise = [[NSButton alloc] initWithFrame:NSZeroRect];
    customise.title = model[@"customiseLabel"] ?: @"Customise";
    customise.bezelStyle = NSBezelStyleAccessoryBarAction;
    customise.controlSize = NSControlSizeRegular;
    customise.font = [NSFont systemFontOfSize:13.0 weight:NSFontWeightRegular];

    NSButton *quit = [[NSButton alloc] initWithFrame:NSZeroRect];
    quit.image = SBSymbol(@"power", 16.0, NSFontWeightRegular);
    quit.imagePosition = NSImageOnly;
    quit.bezelStyle = NSBezelStyleAccessoryBarAction;
    quit.controlSize = NSControlSizeRegular;
    quit.toolTip = model[@"quitLabel"] ?: @"Quit";

    // AppKit owns every pointer, pressed, inactive, and appearance state for
    // all footer buttons. Their system bezel is revealed only while the
    // pointer is inside, using the dedicated NSButton behavior instead of a
    // tracking area, custom layer, or hand-authored color.
    settings.showsBorderOnlyWhileMouseInside = YES;
    customise.showsBorderOnlyWhileMouseInside = YES;
    quit.showsBorderOnlyWhileMouseInside = YES;

    NSArray<NSButton *> *buttons = @[settings, customise, quit];
    NSArray<NSString *> *actions = @[@"settings", @"settings", @"quit"];
    for (NSUInteger index = 0; index < buttons.count; index += 1) {
        buttons[index].buttonType = NSButtonTypeMomentaryPushIn;
        buttons[index].bordered = YES;
        SBNativeControlTarget *target = [SBNativeControlTarget new];
        target.actionName = actions[index];
        target.controlID = @"";
        target.control = buttons[index];
        buttons[index].target = target;
        buttons[index].action = @selector(performControlAction:);
        [self.controlTargets addObject:target];
    }

    for (NSButton *button in buttons) {
        button.translatesAutoresizingMaskIntoConstraints = NO;
        [footer addSubview:button];
    }
    [NSLayoutConstraint activateConstraints:@[
        [settings.leadingAnchor constraintEqualToAnchor:footer.leadingAnchor constant:SBNativeSideInset],
        [settings.centerYAnchor constraintEqualToAnchor:footer.centerYAnchor],
        [settings.widthAnchor constraintEqualToConstant:SBNativeFooterIconButtonWidth],
        [settings.heightAnchor constraintEqualToConstant:SBNativeFooterButtonHeight],
        [customise.leadingAnchor constraintEqualToAnchor:settings.trailingAnchor constant:8.0],
        [customise.trailingAnchor constraintEqualToAnchor:quit.leadingAnchor constant:-8.0],
        [customise.centerYAnchor constraintEqualToAnchor:footer.centerYAnchor],
        [customise.heightAnchor constraintEqualToConstant:SBNativeFooterButtonHeight],
        [quit.trailingAnchor constraintEqualToAnchor:footer.trailingAnchor constant:-SBNativeSideInset],
        [quit.centerYAnchor constraintEqualToAnchor:footer.centerYAnchor],
        [quit.widthAnchor constraintEqualToConstant:SBNativeFooterIconButtonWidth],
        [quit.heightAnchor constraintEqualToConstant:SBNativeFooterButtonHeight],
    ]];
    return footer;
}

- (NSString *)layoutSignatureForModel:(NSDictionary *)model {
    NSArray *rows = [model[@"rows"] isKindOfClass:NSArray.class] ? model[@"rows"] : @[];
    NSMutableArray<NSString *> *parts = [NSMutableArray arrayWithObject:model[@"language"] ?: @""];
    for (NSDictionary *row in rows) {
        [parts addObject:[NSString stringWithFormat:@"%@:%@",
                          row[@"id"] ?: @"", row[@"kind"] ?: @"toggle"]];
    }
    return [parts componentsJoinedByString:@"|"];
}

- (void)updateRow:(NSDictionary *)row
          binding:(NSDictionary *)binding
        useChinese:(BOOL)useChinese {
    BOOL active = [row[@"checked"] boolValue];
    BOOL enabled = row[@"enabled"] == nil || [row[@"enabled"] boolValue];
    BOOL busy = [row[@"pending"] boolValue] || [row[@"locked"] boolValue];
    NSString *kind = row[@"kind"] ?: @"toggle";
    NSString *toolTip = [NSString stringWithFormat:@"%@：%@",
                         row[@"title"] ?: @"", row[@"status"] ?: @""];

    NSImageView *icon = binding[@"icon"];
    icon.image = SBSymbol(row[@"symbol"], 16.0, NSFontWeightRegular);
    icon.contentTintColor = active ? NSColor.controlAccentColor : NSColor.secondaryLabelColor;

    NSTextField *title = binding[@"title"];
    title.stringValue = row[@"title"] ?: @"";
    title.textColor = enabled ? NSColor.labelColor : NSColor.tertiaryLabelColor;

    NSTextField *status = binding[@"status"];
    status.stringValue = row[@"status"] ?: @"";
    status.textColor = [row[@"error"] boolValue]
        ? NSColor.systemRedColor
        : (enabled ? NSColor.secondaryLabelColor : NSColor.tertiaryLabelColor);

    NSControl *affordance = binding[@"affordance"];
    SBNativeControlTarget *target = binding[@"target"];
    target.controlID = row[@"id"] ?: @"";
    target.useChinese = useChinese;
    affordance.toolTip = toolTip;

    if ([affordance isKindOfClass:NSSwitch.class]) {
        NSSwitch *toggle = (NSSwitch *)affordance;
        NSControlStateValue desiredState =
            active ? NSControlStateValueOn : NSControlStateValueOff;
        if (toggle.state != desiredState) {
            // Keep the same AppKit switch instance alive. NSSwitch owns the
            // platform animation; replacing it here causes the thumb to jump.
            [(NSSwitch *)toggle.animator setState:desiredState];
        }
        toggle.enabled = enabled && !busy;
        BOOL momentary = [kind isEqualToString:@"action"];
        target.actionName = momentary ? @"activate" : @"toggle";
        target.timed = !momentary && [row[@"timed"] boolValue] && !active;
    } else if ([affordance isKindOfClass:NSButton.class]) {
        NSButton *button = (NSButton *)affordance;
        button.title = row[@"actionLabel"] ?: @"";
        button.enabled = enabled && !busy;
        target.actionName = @"activate";
        target.timed = NO;
    }

}

- (void)applyModel:(NSDictionary *)model {
    if (![model isKindOfClass:NSDictionary.class]) return;
    NSArray *rows = [model[@"rows"] isKindOfClass:NSArray.class] ? model[@"rows"] : @[];
    NSString *nextSignature = [self layoutSignatureForModel:model];
    BOOL canUpdateInPlace =
        [self.layoutSignature isEqualToString:nextSignature] &&
        self.rowBindings.count == rows.count;
    if (canUpdateInPlace) {
        for (NSDictionary *row in rows) {
            if (self.rowBindings[row[@"id"] ?: @""] == nil) {
                canUpdateInPlace = NO;
                break;
            }
        }
    }
    if (canUpdateInPlace) {
        self.model = model;
        BOOL useChinese = [model[@"language"] isEqualToString:@"zh"];
        for (NSDictionary *row in rows) {
            [self updateRow:row
                    binding:self.rowBindings[row[@"id"] ?: @""]
                 useChinese:useChinese];
        }
        return;
    }

    self.model = model;
    // Accessing self.view loads the controller once. Never call loadView
    // again while the popover is visible: replacing the root view during an
    // NSSwitch animation detaches the active window hierarchy and causes
    // intermittent material, focus, and layout corruption.
    NSView *rootView = self.contentHostView ?: self.view;
    [self.controlTargets removeAllObjects];
    [self.rowBindings removeAllObjects];

    BOOL useChinese = [model[@"language"] isEqualToString:@"zh"];
    NSMutableArray<NSView *> *rowViews = [NSMutableArray arrayWithCapacity:rows.count];
    for (NSDictionary *row in rows) {
        [rowViews addObject:[self rowView:row useChinese:useChinese]];
    }

    NSStackView *rowStack = [NSStackView stackViewWithViews:rowViews];
    rowStack.orientation = NSUserInterfaceLayoutOrientationVertical;
    rowStack.alignment = NSLayoutAttributeLeading;
    rowStack.spacing = 0.0;
    rowStack.translatesAutoresizingMaskIntoConstraints = NO;
    for (NSView *view in rowViews) {
        view.translatesAutoresizingMaskIntoConstraints = NO;
        [view.widthAnchor constraintEqualToAnchor:rowStack.widthAnchor].active = YES;
    }

    SBNativeRowsDocumentView *document = [[SBNativeRowsDocumentView alloc]
        initWithFrame:NSMakeRect(0.0, 0.0, SBNativePopoverWidth,
                                 rows.count * SBNativeRowHeight)];
    [document addSubview:rowStack];
    [NSLayoutConstraint activateConstraints:@[
        [rowStack.leadingAnchor constraintEqualToAnchor:document.leadingAnchor],
        [rowStack.trailingAnchor constraintEqualToAnchor:document.trailingAnchor],
        [rowStack.topAnchor constraintEqualToAnchor:document.topAnchor],
        [rowStack.bottomAnchor constraintEqualToAnchor:document.bottomAnchor],
    ]];

    NSScrollView *scroll = [NSScrollView new];
    scroll.translatesAutoresizingMaskIntoConstraints = NO;
    scroll.drawsBackground = NO;
    scroll.borderType = NSNoBorder;
    scroll.hasHorizontalScroller = NO;
    scroll.hasVerticalScroller = rows.count > SBNativeVisibleRowCapacity;
    scroll.autohidesScrollers = YES;
    scroll.verticalScrollElasticity = NSScrollElasticityAutomatic;
    scroll.documentView = document;

    NSView *header = [self headerView:model];
    NSView *topSeparator = [self groupSeparatorView];
    NSView *bottomSeparator = [self groupSeparatorView];
    NSView *footer = [self footerView:model];
    for (NSView *view in @[header, topSeparator, bottomSeparator, footer]) {
        view.translatesAutoresizingMaskIntoConstraints = NO;
    }
    // Replace the tree only when the row structure changes (for example,
    // customisation or language). State-only updates returned above and keep
    // every existing row, constraint, and NSSwitch instance intact.
    for (NSView *subview in rootView.subviews.copy) {
        [subview removeFromSuperview];
    }
    for (NSView *view in @[header, topSeparator, scroll, bottomSeparator, footer]) {
        [rootView addSubview:view];
    }
    [NSLayoutConstraint activateConstraints:@[
        [header.leadingAnchor constraintEqualToAnchor:rootView.leadingAnchor],
        [header.trailingAnchor constraintEqualToAnchor:rootView.trailingAnchor],
        [header.topAnchor constraintEqualToAnchor:rootView.topAnchor],
        [topSeparator.leadingAnchor constraintEqualToAnchor:rootView.leadingAnchor],
        [topSeparator.trailingAnchor constraintEqualToAnchor:rootView.trailingAnchor],
        [topSeparator.topAnchor constraintEqualToAnchor:header.bottomAnchor],
        [scroll.leadingAnchor constraintEqualToAnchor:rootView.leadingAnchor],
        [scroll.trailingAnchor constraintEqualToAnchor:rootView.trailingAnchor],
        [scroll.topAnchor constraintEqualToAnchor:topSeparator.bottomAnchor],
        [bottomSeparator.leadingAnchor constraintEqualToAnchor:rootView.leadingAnchor],
        [bottomSeparator.trailingAnchor constraintEqualToAnchor:rootView.trailingAnchor],
        [bottomSeparator.topAnchor constraintEqualToAnchor:scroll.bottomAnchor],
        [footer.leadingAnchor constraintEqualToAnchor:rootView.leadingAnchor],
        [footer.trailingAnchor constraintEqualToAnchor:rootView.trailingAnchor],
        [footer.topAnchor constraintEqualToAnchor:bottomSeparator.bottomAnchor],
        [footer.bottomAnchor constraintEqualToAnchor:rootView.bottomAnchor],
    ]];

    // The panel is intentionally non-resizable, so keep the document at the
    // same fixed width as the panel. Width autoresizing must not be enabled
    // here: NSScrollView installs the document while its own frame is still
    // zero and would collapse the row width, clipping every trailing switch.

    self.layoutSignature = nextSignature;
}
@end

static NSPasteboardType const SBNativePreferencesRowType =
    @"design.ryan.onetouch.preferences-row";

static void SBEmitNativePreferencesAction(NSString *action, NSString *controlID,
                                          NSString *payload) {
    if (SBNativePreferencesActionCallback == NULL) return;
    SBNativePreferencesActionCallback((action ?: @"").UTF8String,
                                      (controlID ?: @"").UTF8String,
                                      (payload ?: @"").UTF8String);
}

static NSTextField *SBPreferencesLabel(NSString *value, NSColor *color) {
    NSTextField *label = [NSTextField labelWithString:value ?: @""];
    label.font = [NSFont systemFontOfSize:NSFont.systemFontSize
                                   weight:NSFontWeightRegular];
    label.textColor = color ?: NSColor.labelColor;
    label.lineBreakMode = NSLineBreakByTruncatingTail;
    return label;
}

static NSTextField *SBPreferencesSecondaryLabel(NSString *value) {
    NSTextField *label = [NSTextField wrappingLabelWithString:value ?: @""];
    label.font = [NSFont systemFontOfSize:NSFont.smallSystemFontSize
                                   weight:NSFontWeightRegular];
    label.textColor = NSColor.secondaryLabelColor;
    label.maximumNumberOfLines = 0;
    return label;
}

static NSImageView *SBPreferencesSymbolView(NSString *symbolName) {
    NSImageView *imageView = [NSImageView new];
    imageView.translatesAutoresizingMaskIntoConstraints = NO;
    imageView.image = SBSymbol(symbolName ?: @"circle", 15.0, NSFontWeightRegular);
    imageView.imageScaling = NSImageScaleProportionallyDown;
    imageView.contentTintColor = NSColor.secondaryLabelColor;
    [imageView.widthAnchor constraintEqualToConstant:24.0].active = YES;
    [imageView.heightAnchor constraintEqualToConstant:24.0].active = YES;
    return imageView;
}

static NSString *SBShortcutKeyForEvent(NSEvent *event) {
    NSDictionary<NSNumber *, NSString *> *keyCodes = @{
        @36: @"Enter", @48: @"Tab", @49: @"Space",
        @115: @"Home", @119: @"End", @116: @"PageUp", @121: @"PageDown",
        @123: @"ArrowLeft", @124: @"ArrowRight", @125: @"ArrowDown", @126: @"ArrowUp",
        @50: @"Backquote", @27: @"Minus", @24: @"Equal",
        @33: @"BracketLeft", @30: @"BracketRight", @42: @"Backslash",
        @41: @"Semicolon", @39: @"Quote", @43: @"Comma", @47: @"Period", @44: @"Slash",
        @122: @"F1", @120: @"F2", @99: @"F3", @118: @"F4",
        @96: @"F5", @97: @"F6", @98: @"F7", @100: @"F8",
        @101: @"F9", @109: @"F10", @103: @"F11", @111: @"F12",
        @105: @"F13", @107: @"F14", @113: @"F15", @106: @"F16",
        @64: @"F17", @79: @"F18", @80: @"F19", @90: @"F20",
    };
    NSString *mapped = keyCodes[@(event.keyCode)];
    if (mapped.length > 0) return mapped;

    NSString *characters = event.charactersIgnoringModifiers.uppercaseString ?: @"";
    if (characters.length != 1) return nil;
    unichar character = [characters characterAtIndex:0];
    if ((character >= 'A' && character <= 'Z') ||
        (character >= '0' && character <= '9')) {
        return characters;
    }
    return nil;
}

@implementation SBNativePreferencesController

static const CGFloat SBNativePreferencesContentWidth = 400.0;
static const CGFloat SBNativePreferencesGeneralHeight = 144.0;
static const CGFloat SBNativePreferencesListHeight = 420.0;
static const CGFloat SBNativePreferencesAboutHeight = 244.0;
static const CGFloat SBNativePreferencesHorizontalInset = 20.0;
static const CGFloat SBNativePreferencesRowHeight = 34.0;
static const CGFloat SBNativePreferencesShortcutButtonWidth = 72.0;

- (instancetype)init {
    self = [super init];
    if (self != nil) {
        self.tabStyle = NSTabViewControllerTabStyleToolbar;
        _rows = @[];
    }
    return self;
}

- (void)setSelectedTabViewItemIndex:(NSInteger)selectedTabViewItemIndex {
    [super setSelectedTabViewItemIndex:selectedTabViewItemIndex];
    if (selectedTabViewItemIndex < 0 ||
        selectedTabViewItemIndex >= (NSInteger)self.tabViewItems.count) return;
    [self updatePreferencesWindowTitle];
    [self resizeWindowForSelectedTabAnimated:YES];
}

- (void)updatePreferencesWindowTitle {
    NSInteger selected = self.selectedTabViewItemIndex;
    if (selected < 0 || selected >= (NSInteger)self.tabViewItems.count) return;
    NSString *label = self.tabViewItems[selected].label;
    if (label.length > 0) self.view.window.title = label;
}

- (NSSize)contentSizeForSelectedTab {
    CGFloat height = SBNativePreferencesListHeight;
    switch (self.selectedTabViewItemIndex) {
        case 0:
            height = SBNativePreferencesGeneralHeight;
            break;
        case 3:
            height = SBNativePreferencesAboutHeight;
            break;
        default:
            break;
    }
    return NSMakeSize(SBNativePreferencesContentWidth, height);
}

- (void)resizeWindowForSelectedTabAnimated:(BOOL)animated {
    NSWindow *window = self.view.window;
    if (window == nil || self.tabViewItems.count == 0) return;

    NSSize contentSize = [self contentSizeForSelectedTab];
    NSRect currentFrame = window.frame;
    NSRect targetFrame = [window frameRectForContentRect:
        NSMakeRect(0.0, 0.0, contentSize.width, contentSize.height)];
    targetFrame.origin.x = round(NSMidX(currentFrame) - NSWidth(targetFrame) / 2.0);
    targetFrame.origin.y = window.isVisible
        ? round(NSMaxY(currentFrame) - NSHeight(targetFrame))
        : round(NSMidY(currentFrame) - NSHeight(targetFrame) / 2.0);

    NSScreen *screen = window.screen ?: NSScreen.mainScreen;
    if (screen != nil) {
        targetFrame = [window constrainFrameRect:targetFrame toScreen:screen];
    }
    BOOL shouldAnimate = animated && window.isVisible;
    [window setFrame:targetFrame display:YES animate:shouldAnimate];
}

- (NSDictionary *)strings {
    NSDictionary *strings = [self.model[@"strings"] isKindOfClass:NSDictionary.class]
        ? self.model[@"strings"]
        : @{};
    return strings;
}

- (NSInteger)visibleCount {
    NSInteger count = 0;
    for (NSDictionary *row in self.rows) {
        if ([row[@"visible"] boolValue]) count += 1;
    }
    return count;
}

- (NSViewController *)generalController {
    NSDictionary *strings = self.strings;
    NSViewController *controller = [NSViewController new];
    NSView *root = [NSView new];
    controller.view = root;

    self.languagePopup = [[NSPopUpButton alloc] initWithFrame:NSZeroRect pullsDown:NO];
    self.languagePopup.controlSize = NSControlSizeRegular;
    [self.languagePopup addItemWithTitle:@"简体中文"];
    self.languagePopup.lastItem.representedObject = @"zh";
    [self.languagePopup addItemWithTitle:@"English"];
    self.languagePopup.lastItem.representedObject = @"en";
    self.languagePopup.target = self;
    self.languagePopup.action = @selector(languageChanged:);
    [self.languagePopup.widthAnchor constraintEqualToConstant:184.0].active = YES;

    self.loginSwitch = [NSSwitch new];
    self.loginSwitch.controlSize = NSControlSizeRegular;
    self.loginSwitch.target = self;
    self.loginSwitch.action = @selector(loginChanged:);

    NSTextField *languageLabel =
        SBPreferencesLabel(strings[@"language"], NSColor.labelColor);
    NSTextField *loginLabel =
        SBPreferencesLabel(strings[@"startAtLogin"], NSColor.labelColor);
    for (NSTextField *label in @[languageLabel, loginLabel]) {
        label.alignment = NSTextAlignmentRight;
    }

    self.loginNote = SBPreferencesSecondaryLabel(strings[@"startAtLoginNote"]);
    NSTextField *emptyLabel = SBPreferencesLabel(@"", NSColor.labelColor);
    NSGridView *grid = [NSGridView gridViewWithViews:@[
        @[languageLabel, self.languagePopup],
        @[loginLabel, self.loginSwitch],
        @[emptyLabel, self.loginNote],
    ]];
    grid.translatesAutoresizingMaskIntoConstraints = NO;
    grid.rowSpacing = 6.0;
    grid.columnSpacing = 14.0;
    [grid columnAtIndex:0].xPlacement = NSGridCellPlacementTrailing;
    [grid columnAtIndex:1].xPlacement = NSGridCellPlacementLeading;
    [root addSubview:grid];

    [NSLayoutConstraint activateConstraints:@[
        [grid.centerXAnchor constraintEqualToAnchor:root.centerXAnchor],
        [grid.topAnchor constraintEqualToAnchor:root.topAnchor constant:26.0],
    ]];
    return controller;
}

- (NSTableView *)newPreferencesTable {
    NSTableView *table = [NSTableView new];
    NSTableColumn *column =
        [[NSTableColumn alloc] initWithIdentifier:@"primary"];
    column.resizingMask = NSTableColumnAutoresizingMask;
    [table addTableColumn:column];
    table.headerView = nil;
    table.delegate = self;
    table.dataSource = self;
    table.selectionHighlightStyle = NSTableViewSelectionHighlightStyleNone;
    table.allowsEmptySelection = YES;
    table.usesAlternatingRowBackgroundColors = NO;
    table.intercellSpacing = NSMakeSize(0.0, 2.0);
    if (@available(macOS 11.0, *)) table.style = NSTableViewStyleInset;
    return table;
}

- (NSViewController *)customiseController {
    NSDictionary *strings = self.strings;
    NSViewController *controller = [NSViewController new];
    NSView *root = [NSView new];
    controller.view = root;

    NSTextField *lead = SBPreferencesSecondaryLabel(strings[@"customiseIntro"]);
    lead.translatesAutoresizingMaskIntoConstraints = NO;
    [root addSubview:lead];

    self.visibleCountLabel = SBPreferencesLabel(@"", NSColor.secondaryLabelColor);
    self.visibleCountLabel.alignment = NSTextAlignmentRight;
    self.visibleCountLabel.translatesAutoresizingMaskIntoConstraints = NO;
    [root addSubview:self.visibleCountLabel];

    self.customSearchField = [NSSearchField new];
    self.customSearchField.translatesAutoresizingMaskIntoConstraints = NO;
    self.customSearchField.placeholderString =
        strings[@"searchControls"] ?: @"Search controls";
    self.customSearchField.sendsSearchStringImmediately = YES;
    self.customSearchField.target = self;
    self.customSearchField.action = @selector(filterChanged:);
    [root addSubview:self.customSearchField];

    NSScrollView *scroll = [NSScrollView new];
    scroll.translatesAutoresizingMaskIntoConstraints = NO;
    scroll.hasVerticalScroller = YES;
    scroll.drawsBackground = NO;
    scroll.borderType = NSNoBorder;
    self.customTable = [self newPreferencesTable];
    self.customTable.rowHeight = SBNativePreferencesRowHeight;
    [self.customTable registerForDraggedTypes:@[SBNativePreferencesRowType]];
    [self.customTable setDraggingSourceOperationMask:NSDragOperationMove forLocal:YES];
    scroll.documentView = self.customTable;
    [root addSubview:scroll];

    [NSLayoutConstraint activateConstraints:@[
        [lead.leadingAnchor constraintEqualToAnchor:root.leadingAnchor
                                                     constant:SBNativePreferencesHorizontalInset],
        [lead.topAnchor constraintEqualToAnchor:root.topAnchor constant:14.0],
        [lead.trailingAnchor constraintLessThanOrEqualToAnchor:self.visibleCountLabel.leadingAnchor
                                                      constant:-12.0],
        [self.visibleCountLabel.trailingAnchor constraintEqualToAnchor:root.trailingAnchor
                                                               constant:-SBNativePreferencesHorizontalInset],
        [self.visibleCountLabel.centerYAnchor constraintEqualToAnchor:lead.centerYAnchor],
        [self.customSearchField.leadingAnchor constraintEqualToAnchor:root.leadingAnchor
                                                              constant:SBNativePreferencesHorizontalInset],
        [self.customSearchField.trailingAnchor constraintEqualToAnchor:root.trailingAnchor
                                                               constant:-SBNativePreferencesHorizontalInset],
        [self.customSearchField.topAnchor constraintEqualToAnchor:lead.bottomAnchor
                                                          constant:8.0],
        [scroll.leadingAnchor constraintEqualToAnchor:root.leadingAnchor],
        [scroll.trailingAnchor constraintEqualToAnchor:root.trailingAnchor],
        [scroll.topAnchor constraintEqualToAnchor:self.customSearchField.bottomAnchor
                                          constant:8.0],
        [scroll.bottomAnchor constraintEqualToAnchor:root.bottomAnchor],
    ]];
    return controller;
}

- (NSViewController *)shortcutsController {
    NSDictionary *strings = self.strings;
    NSViewController *controller = [NSViewController new];
    NSView *root = [NSView new];
    controller.view = root;

    NSTextField *lead = SBPreferencesSecondaryLabel(strings[@"shortcutIntro"]);
    lead.translatesAutoresizingMaskIntoConstraints = NO;
    [root addSubview:lead];

    self.shortcutSearchField = [NSSearchField new];
    self.shortcutSearchField.translatesAutoresizingMaskIntoConstraints = NO;
    self.shortcutSearchField.placeholderString =
        strings[@"searchControls"] ?: @"Search controls";
    self.shortcutSearchField.sendsSearchStringImmediately = YES;
    self.shortcutSearchField.target = self;
    self.shortcutSearchField.action = @selector(filterChanged:);
    [root addSubview:self.shortcutSearchField];

    NSScrollView *scroll = [NSScrollView new];
    scroll.translatesAutoresizingMaskIntoConstraints = NO;
    scroll.hasVerticalScroller = YES;
    scroll.drawsBackground = NO;
    scroll.borderType = NSNoBorder;
    self.shortcutTable = [self newPreferencesTable];
    self.shortcutTable.rowHeight = SBNativePreferencesRowHeight;
    scroll.documentView = self.shortcutTable;
    [root addSubview:scroll];

    self.shortcutHint = SBPreferencesSecondaryLabel(strings[@"shortcutHint"]);
    self.shortcutHint.translatesAutoresizingMaskIntoConstraints = NO;
    [root addSubview:self.shortcutHint];

    [NSLayoutConstraint activateConstraints:@[
        [lead.leadingAnchor constraintEqualToAnchor:root.leadingAnchor
                                                     constant:SBNativePreferencesHorizontalInset],
        [lead.trailingAnchor constraintEqualToAnchor:root.trailingAnchor
                                                      constant:-SBNativePreferencesHorizontalInset],
        [lead.topAnchor constraintEqualToAnchor:root.topAnchor constant:14.0],
        [self.shortcutSearchField.leadingAnchor constraintEqualToAnchor:root.leadingAnchor
                                                                constant:SBNativePreferencesHorizontalInset],
        [self.shortcutSearchField.trailingAnchor constraintEqualToAnchor:root.trailingAnchor
                                                                 constant:-SBNativePreferencesHorizontalInset],
        [self.shortcutSearchField.topAnchor constraintEqualToAnchor:lead.bottomAnchor
                                                            constant:8.0],
        [scroll.leadingAnchor constraintEqualToAnchor:root.leadingAnchor],
        [scroll.trailingAnchor constraintEqualToAnchor:root.trailingAnchor],
        [scroll.topAnchor constraintEqualToAnchor:self.shortcutSearchField.bottomAnchor
                                          constant:8.0],
        [self.shortcutHint.leadingAnchor constraintEqualToAnchor:root.leadingAnchor
                                                          constant:SBNativePreferencesHorizontalInset],
        [self.shortcutHint.trailingAnchor constraintEqualToAnchor:root.trailingAnchor
                                                           constant:-SBNativePreferencesHorizontalInset],
        [self.shortcutHint.bottomAnchor constraintEqualToAnchor:root.bottomAnchor constant:-10.0],
        [scroll.bottomAnchor constraintEqualToAnchor:self.shortcutHint.topAnchor constant:-8.0],
    ]];
    return controller;
}

- (NSViewController *)aboutController {
    NSDictionary *strings = self.strings;
    NSViewController *controller = [NSViewController new];
    NSView *root = [NSView new];
    controller.view = root;

    NSStackView *stack = [NSStackView new];
    stack.translatesAutoresizingMaskIntoConstraints = NO;
    stack.orientation = NSUserInterfaceLayoutOrientationVertical;
    stack.alignment = NSLayoutAttributeCenterX;
    stack.spacing = 8.0;
    [root addSubview:stack];

    NSImageView *mark = [NSImageView new];
    mark.translatesAutoresizingMaskIntoConstraints = NO;
    mark.image = NSApplication.sharedApplication.applicationIconImage;
    mark.imageScaling = NSImageScaleProportionallyUpOrDown;
    [mark.widthAnchor constraintEqualToConstant:56.0].active = YES;
    [mark.heightAnchor constraintEqualToConstant:56.0].active = YES;
    NSTextField *title = SBPreferencesLabel(strings[@"aboutTitle"] ?: @"OneTouch",
                                            NSColor.labelColor);
    title.font = [NSFont systemFontOfSize:18.0 weight:NSFontWeightMedium];
    self.aboutVersion = SBPreferencesLabel(@"", NSColor.secondaryLabelColor);
    self.aboutGitHubButton = [NSButton buttonWithTitle:strings[@"github"] ?: @"GitHub"
                                                target:self
                                                action:@selector(openAboutGitHub:)];
    self.aboutGitHubButton.bezelStyle = NSBezelStyleAccessoryBarAction;
    self.aboutGitHubButton.controlSize = NSControlSizeSmall;
    self.aboutGitHubButton.image = SBSymbol(@"arrow.up.right.square", 11.0,
                                            NSFontWeightRegular);
    self.aboutGitHubButton.imagePosition = NSImageTrailing;
    self.aboutGitHubButton.showsBorderOnlyWhileMouseInside = YES;
    self.aboutGitHubButton.enabled = NO;
    self.aboutUpdateButton = [NSButton buttonWithTitle:strings[@"checkForUpdates"] ?: @"Check for Updates…"
                                                 target:self
                                                 action:@selector(checkForUpdates:)];
    self.aboutUpdateButton.bezelStyle = NSBezelStyleRounded;
    self.aboutUpdateButton.controlSize = NSControlSizeRegular;
    self.aboutUpdateStatus = SBPreferencesSecondaryLabel(@"");
    self.aboutUpdateStatus.alignment = NSTextAlignmentCenter;
    self.aboutUpdateStatus.hidden = YES;
    [self.aboutUpdateStatus.widthAnchor constraintLessThanOrEqualToConstant:320.0].active = YES;
    for (NSView *view in @[mark, title, self.aboutVersion, self.aboutUpdateButton,
                           self.aboutUpdateStatus, self.aboutGitHubButton]) {
        [stack addArrangedSubview:view];
    }

    [NSLayoutConstraint activateConstraints:@[
        [stack.centerXAnchor constraintEqualToAnchor:root.centerXAnchor],
        [stack.centerYAnchor constraintEqualToAnchor:root.centerYAnchor constant:-18.0],
    ]];
    return controller;
}

- (void)checkForUpdates:(id)sender {
    (void)sender;
    NSDictionary *update = [self.model[@"update"] isKindOfClass:NSDictionary.class]
        ? self.model[@"update"]
        : @{};
    NSString *phase = [update[@"phase"] isKindOfClass:NSString.class]
        ? update[@"phase"]
        : @"idle";
    NSString *request = [phase isEqualToString:@"available"] ? @"install" : @"check";
    self.aboutUpdateButton.enabled = NO;
    SBEmitNativePreferencesAction(@"appUpdate", @"", request);
}

- (void)openAboutGitHub:(id)sender {
    (void)sender;
    NSString *urlString = [self.model[@"githubURL"] isKindOfClass:NSString.class]
        ? self.model[@"githubURL"]
        : @"";
    NSURL *url = [NSURL URLWithString:urlString];
    NSString *scheme = url.scheme.lowercaseString;
    if (url == nil ||
        !([scheme isEqualToString:@"https"] || [scheme isEqualToString:@"http"])) return;
    [NSWorkspace.sharedWorkspace openURL:url];
}

- (void)rebuildTabs {
    NSInteger selected = self.tabViewItems.count > 0 ? self.selectedTabViewItemIndex : 0;
    for (NSTabViewItem *item in self.tabViewItems.copy) {
        [self removeTabViewItem:item];
    }
    NSArray<NSString *> *keys = @[@"general", @"customise", @"shortcuts", @"about"];
    NSArray<NSString *> *symbols =
        @[@"gearshape", @"slider.horizontal.3", @"keyboard", @"info.circle"];
    NSArray<NSViewController *> *controllers = @[
        [self generalController],
        [self customiseController],
        [self shortcutsController],
        [self aboutController],
    ];
    for (NSUInteger index = 0; index < controllers.count; index += 1) {
        NSTabViewItem *item =
            [NSTabViewItem tabViewItemWithViewController:controllers[index]];
        item.label = self.strings[keys[index]] ?: keys[index];
        item.image = SBSymbol(symbols[index], 15.0, NSFontWeightRegular);
        [self addTabViewItem:item];
    }
    self.selectedTabViewItemIndex =
        MIN(MAX(selected, 0), (NSInteger)self.tabViewItems.count - 1);
    [self updatePreferencesWindowTitle];
}

- (void)updateVisibleCount {
    NSString *format = self.strings[@"visibleCount"] ?: @"%ld selected";
    self.visibleCountLabel.stringValue =
        [NSString stringWithFormat:format, (long)self.visibleCount];
}

- (void)updateGeneralControls {
    NSString *language = self.model[@"language"] ?: @"zh";
    for (NSMenuItem *item in self.languagePopup.itemArray) {
        if ([item.representedObject isEqual:language]) {
            [self.languagePopup selectItem:item];
            break;
        }
    }
    self.loginSwitch.state = [self.model[@"startAtLogin"] boolValue]
        ? NSControlStateValueOn
        : NSControlStateValueOff;
    BOOL loading = [self.model[@"startAtLoginLoading"] boolValue];
    self.loginSwitch.enabled = !loading;
    NSString *error = self.model[@"startAtLoginError"] ?: @"";
    self.loginNote.stringValue =
        error.length > 0 ? error : (self.strings[@"startAtLoginNote"] ?: @"");
    self.loginNote.textColor =
        error.length > 0 ? NSColor.systemRedColor : NSColor.secondaryLabelColor;
}

- (void)updateShortcutHint {
    if (self.recordingShortcutID.length > 0) return;
    NSString *message = self.model[@"shortcutMessage"] ?: @"";
    self.shortcutHint.stringValue =
        message.length > 0 ? message : (self.strings[@"shortcutHint"] ?: @"");
    self.shortcutHint.textColor = [self.model[@"shortcutMessageError"] boolValue]
        ? NSColor.systemRedColor
        : NSColor.secondaryLabelColor;
}

- (NSArray<NSDictionary *> *)rowsForTable:(NSTableView *)tableView {
    NSSearchField *searchField =
        tableView == self.customTable ? self.customSearchField : self.shortcutSearchField;
    NSString *query =
        [searchField.stringValue stringByTrimmingCharactersInSet:
            NSCharacterSet.whitespaceAndNewlineCharacterSet];
    if (query.length == 0) return self.rows;

    NSMutableArray<NSDictionary *> *filtered = [NSMutableArray array];
    for (NSDictionary *row in self.rows) {
        NSString *title = [row[@"title"] isKindOfClass:NSString.class]
            ? row[@"title"]
            : @"";
        if ([title localizedCaseInsensitiveContainsString:query]) {
            [filtered addObject:row];
        }
    }
    return filtered;
}

- (void)filterChanged:(NSSearchField *)sender {
    if (sender == self.customSearchField) {
        [self.customTable reloadData];
    } else if (sender == self.shortcutSearchField) {
        [self.shortcutTable reloadData];
    }
}

- (void)applyModel:(NSDictionary *)model {
    if (![model isKindOfClass:NSDictionary.class]) return;
    NSString *oldLanguage = self.model[@"language"];
    NSUInteger oldRowCount = self.rows.count;
    self.model = model;
    self.rows = [model[@"rows"] isKindOfClass:NSArray.class] ? model[@"rows"] : @[];
    BOOL rebuild = self.tabViewItems.count == 0 ||
                   ![oldLanguage isEqualToString:model[@"language"]] ||
                   (oldRowCount == 0 && self.rows.count > 0);
    if (rebuild) {
        [self endShortcutRecording];
        [self rebuildTabs];
    }
    [self updateGeneralControls];
    [self updateVisibleCount];
    [self.customTable reloadData];
    [self.shortcutTable reloadData];
    [self updateShortcutHint];
    NSString *version = model[@"appVersion"] ?: @"";
    NSString *versionFormat = self.strings[@"version"] ?: @"Version %@";
    self.aboutVersion.stringValue =
        version.length > 0 ? [NSString stringWithFormat:versionFormat, version] : @"";
    NSString *githubURL = [model[@"githubURL"] isKindOfClass:NSString.class]
        ? model[@"githubURL"]
        : @"";
    self.aboutGitHubButton.enabled = githubURL.length > 0;
    self.aboutGitHubButton.toolTip = githubURL.length > 0
        ? (self.strings[@"github"] ?: @"GitHub")
        : (self.strings[@"githubPending"] ?: @"GitHub link coming soon");
    NSDictionary *update = [model[@"update"] isKindOfClass:NSDictionary.class]
        ? model[@"update"]
        : @{};
    NSString *phase = [update[@"phase"] isKindOfClass:NSString.class]
        ? update[@"phase"]
        : @"idle";
    NSString *updateTitle = [update[@"title"] isKindOfClass:NSString.class]
        ? update[@"title"]
        : (self.strings[@"checkForUpdates"] ?: @"Check for Updates…");
    NSString *updateStatus = [update[@"status"] isKindOfClass:NSString.class]
        ? update[@"status"]
        : @"";
    self.aboutUpdateButton.title = updateTitle;
    self.aboutUpdateButton.enabled = ![@[@"checking", @"downloading", @"installing", @"restarting"]
        containsObject:phase];
    self.aboutUpdateStatus.stringValue = updateStatus;
    self.aboutUpdateStatus.hidden = updateStatus.length == 0;
    [self updatePreferencesWindowTitle];
}

- (NSInteger)numberOfRowsInTableView:(NSTableView *)tableView {
    return [self rowsForTable:tableView].count;
}

- (NSView *)customCellForRow:(NSDictionary *)row {
    NSTableCellView *cell = [NSTableCellView new];
    NSImageView *icon = SBPreferencesSymbolView(row[@"symbol"]);
    [cell addSubview:icon];

    NSTextField *title = SBPreferencesLabel(row[@"title"], NSColor.labelColor);
    title.translatesAutoresizingMaskIntoConstraints = NO;
    [cell addSubview:title];

    NSImageView *handle = SBPreferencesSymbolView(@"line.3.horizontal");
    handle.contentTintColor = NSColor.tertiaryLabelColor;
    [cell addSubview:handle];

    NSButton *checkbox = [NSButton checkboxWithTitle:@""
                                              target:self
                                              action:@selector(visibilityChanged:)];
    checkbox.translatesAutoresizingMaskIntoConstraints = NO;
    checkbox.controlSize = NSControlSizeSmall;
    checkbox.identifier = row[@"id"] ?: @"";
    checkbox.state = [row[@"visible"] boolValue]
        ? NSControlStateValueOn
        : NSControlStateValueOff;
    [cell addSubview:checkbox];

    [NSLayoutConstraint activateConstraints:@[
        [icon.leadingAnchor constraintEqualToAnchor:cell.leadingAnchor constant:14.0],
        [icon.centerYAnchor constraintEqualToAnchor:cell.centerYAnchor],
        [title.leadingAnchor constraintEqualToAnchor:icon.trailingAnchor constant:8.0],
        [title.centerYAnchor constraintEqualToAnchor:cell.centerYAnchor],
        [title.trailingAnchor constraintLessThanOrEqualToAnchor:handle.leadingAnchor constant:-8.0],
        [checkbox.trailingAnchor constraintEqualToAnchor:cell.trailingAnchor constant:-14.0],
        [checkbox.centerYAnchor constraintEqualToAnchor:cell.centerYAnchor],
        [handle.trailingAnchor constraintEqualToAnchor:checkbox.leadingAnchor constant:-8.0],
        [handle.centerYAnchor constraintEqualToAnchor:cell.centerYAnchor],
    ]];
    return cell;
}

- (NSView *)shortcutCellForRow:(NSDictionary *)row {
    NSTableCellView *cell = [NSTableCellView new];
    NSImageView *icon = SBPreferencesSymbolView(row[@"symbol"]);
    [cell addSubview:icon];
    NSTextField *title = SBPreferencesLabel(row[@"title"], NSColor.labelColor);
    title.translatesAutoresizingMaskIntoConstraints = NO;
    [cell addSubview:title];

    NSString *controlID = row[@"id"] ?: @"";
    NSString *display = row[@"shortcutDisplay"] ?: @"";
    BOOL recording = [self.recordingShortcutID isEqualToString:controlID];
    NSButton *record = [NSButton buttonWithTitle:
        recording ? (self.strings[@"shortcutRecording"] ?: @"Press shortcut…")
                  : (display.length > 0 ? display
                                        : (self.strings[@"shortcutRecord"] ?: @"Record"))
                                             target:self
                                             action:@selector(recordShortcut:)];
    record.translatesAutoresizingMaskIntoConstraints = NO;
    record.identifier = controlID;
    record.bezelStyle = NSBezelStyleRounded;
    record.controlSize = NSControlSizeSmall;
    [cell addSubview:record];

    // Do not reserve layout space for an invisible clear button. Empty
    // shortcuts align their Record button with the normal trailing control
    // column; assigned shortcuts add the clear accessory as a real sibling.
    NSButton *clear = nil;
    if (display.length > 0) {
        clear = [[NSButton alloc] initWithFrame:NSZeroRect];
        clear.translatesAutoresizingMaskIntoConstraints = NO;
        clear.identifier = controlID;
        clear.image = SBSymbol(@"xmark", 11.0, NSFontWeightRegular);
        clear.imagePosition = NSImageOnly;
        clear.bezelStyle = NSBezelStyleAccessoryBarAction;
        clear.showsBorderOnlyWhileMouseInside = YES;
        clear.toolTip = self.strings[@"shortcutClear"] ?: @"Clear shortcut";
        clear.target = self;
        clear.action = @selector(clearShortcut:);
        [cell addSubview:clear];
    }

    NSMutableArray<NSLayoutConstraint *> *constraints = [NSMutableArray arrayWithArray:@[
        [icon.leadingAnchor constraintEqualToAnchor:cell.leadingAnchor constant:14.0],
        [icon.centerYAnchor constraintEqualToAnchor:cell.centerYAnchor],
        [title.leadingAnchor constraintEqualToAnchor:icon.trailingAnchor constant:8.0],
        [title.centerYAnchor constraintEqualToAnchor:cell.centerYAnchor],
        [title.trailingAnchor constraintLessThanOrEqualToAnchor:record.leadingAnchor constant:-10.0],
        [record.centerYAnchor constraintEqualToAnchor:cell.centerYAnchor],
        [record.widthAnchor constraintGreaterThanOrEqualToConstant:
            SBNativePreferencesShortcutButtonWidth],
    ]];
    if (clear != nil) {
        [constraints addObjectsFromArray:@[
            [clear.trailingAnchor constraintEqualToAnchor:cell.trailingAnchor constant:-12.0],
            [clear.centerYAnchor constraintEqualToAnchor:cell.centerYAnchor],
            [clear.widthAnchor constraintEqualToConstant:28.0],
            [clear.heightAnchor constraintEqualToConstant:28.0],
            [record.trailingAnchor constraintEqualToAnchor:clear.leadingAnchor constant:-6.0],
        ]];
    } else {
        [constraints addObject:
            [record.trailingAnchor constraintEqualToAnchor:cell.trailingAnchor constant:-14.0]];
    }
    [NSLayoutConstraint activateConstraints:constraints];
    return cell;
}

- (NSView *)tableView:(NSTableView *)tableView
    viewForTableColumn:(NSTableColumn *)tableColumn
                   row:(NSInteger)rowIndex {
    NSArray<NSDictionary *> *displayRows = [self rowsForTable:tableView];
    if (rowIndex < 0 || rowIndex >= (NSInteger)displayRows.count) return nil;
    NSDictionary *row = displayRows[(NSUInteger)rowIndex];
    return tableView == self.customTable ? [self customCellForRow:row]
                                         : [self shortcutCellForRow:row];
}

- (id<NSPasteboardWriting>)tableView:(NSTableView *)tableView
          pasteboardWriterForRow:(NSInteger)rowIndex {
    if (tableView != self.customTable ||
        self.customSearchField.stringValue.length > 0) return nil;
    NSArray<NSDictionary *> *displayRows = [self rowsForTable:tableView];
    if (rowIndex < 0 || rowIndex >= (NSInteger)displayRows.count) return nil;
    NSPasteboardItem *item = [NSPasteboardItem new];
    [item setString:displayRows[(NSUInteger)rowIndex][@"id"] ?: @""
            forType:SBNativePreferencesRowType];
    return item;
}

- (NSDragOperation)tableView:(NSTableView *)tableView
                 validateDrop:(id<NSDraggingInfo>)info
                  proposedRow:(NSInteger)row
        proposedDropOperation:(NSTableViewDropOperation)dropOperation {
    if (tableView != self.customTable ||
        self.customSearchField.stringValue.length > 0) return NSDragOperationNone;
    [tableView setDropRow:row dropOperation:NSTableViewDropAbove];
    return NSDragOperationMove;
}

- (BOOL)tableView:(NSTableView *)tableView
       acceptDrop:(id<NSDraggingInfo>)info
              row:(NSInteger)targetRow
    dropOperation:(NSTableViewDropOperation)dropOperation {
    if (tableView != self.customTable ||
        self.customSearchField.stringValue.length > 0) return NO;
    NSString *controlID =
        [info.draggingPasteboard stringForType:SBNativePreferencesRowType];
    NSInteger sourceRow = [self.rows indexOfObjectPassingTest:
        ^BOOL(NSDictionary *row, NSUInteger index, BOOL *stop) {
            (void)index;
            (void)stop;
            return [row[@"id"] isEqualToString:controlID];
        }];
    if (sourceRow == NSNotFound) return NO;

    NSMutableArray<NSDictionary *> *next = [self.rows mutableCopy];
    NSDictionary *moved = next[(NSUInteger)sourceRow];
    [next removeObjectAtIndex:(NSUInteger)sourceRow];
    NSInteger insertion = targetRow;
    if (sourceRow < targetRow) insertion -= 1;
    insertion = MAX(0, MIN(insertion, (NSInteger)next.count));
    [next insertObject:moved atIndex:(NSUInteger)insertion];
    self.rows = next;
    [self.customTable reloadData];

    NSArray<NSString *> *orderedIDs = [next valueForKey:@"id"];
    NSData *data = [NSJSONSerialization dataWithJSONObject:orderedIDs options:0 error:nil];
    NSString *payload = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
    SBEmitNativePreferencesAction(@"order", @"", payload ?: @"[]");
    return YES;
}

- (void)languageChanged:(NSPopUpButton *)sender {
    SBEmitNativePreferencesAction(@"language", @"",
                                  sender.selectedItem.representedObject ?: @"zh");
}

- (void)loginChanged:(NSSwitch *)sender {
    sender.enabled = NO;
    SBEmitNativePreferencesAction(@"startAtLogin", @"",
                                  sender.state == NSControlStateValueOn ? @"1" : @"0");
}

- (void)visibilityChanged:(NSButton *)sender {
    NSString *controlID = sender.identifier ?: @"";
    BOOL requestedVisible = sender.state == NSControlStateValueOn;
    NSMutableArray<NSDictionary *> *next = [NSMutableArray arrayWithCapacity:self.rows.count];
    for (NSDictionary *row in self.rows) {
        if ([row[@"id"] isEqualToString:controlID]) {
            NSMutableDictionary *updated = [row mutableCopy];
            updated[@"visible"] = @(requestedVisible);
            [next addObject:updated];
        } else {
            [next addObject:row];
        }
    }
    self.rows = next;
    [self updateVisibleCount];
    [self.customTable reloadData];
    SBEmitNativePreferencesAction(@"visibility", controlID,
                                  requestedVisible ? @"1" : @"0");
}

- (void)endShortcutRecording {
    if (self.shortcutMonitor != nil) {
        [NSEvent removeMonitor:self.shortcutMonitor];
        self.shortcutMonitor = nil;
    }
    self.recordingShortcutID = nil;
    [self.shortcutTable reloadData];
    [self updateShortcutHint];
}

- (NSEvent *)handleShortcutEvent:(NSEvent *)event {
    NSDictionary *strings = self.strings;
    if (event.keyCode == 53) {
        [self endShortcutRecording];
        return nil;
    }
    if (event.keyCode == 51 || event.keyCode == 117) {
        NSString *controlID = self.recordingShortcutID ?: @"";
        [self endShortcutRecording];
        SBEmitNativePreferencesAction(@"shortcut", controlID, @"");
        return nil;
    }

    NSString *key = SBShortcutKeyForEvent(event);
    if (key.length == 0) {
        self.shortcutHint.stringValue = strings[@"shortcutNeedsKey"] ?: @"Press a key.";
        self.shortcutHint.textColor = NSColor.systemRedColor;
        return nil;
    }
    NSEventModifierFlags flags =
        event.modifierFlags & NSEventModifierFlagDeviceIndependentFlagsMask;
    BOOL hasPrimaryModifier =
        (flags & NSEventModifierFlagCommand) ||
        (flags & NSEventModifierFlagControl) ||
        (flags & NSEventModifierFlagOption);
    if (!hasPrimaryModifier) {
        self.shortcutHint.stringValue =
            strings[@"shortcutNeedsModifier"] ?: @"Add Command, Control, or Option.";
        self.shortcutHint.textColor = NSColor.systemRedColor;
        return nil;
    }

    NSMutableArray<NSString *> *parts = [NSMutableArray array];
    if (flags & NSEventModifierFlagCommand) [parts addObject:@"CommandOrControl"];
    if (flags & NSEventModifierFlagControl) [parts addObject:@"Control"];
    if (flags & NSEventModifierFlagOption) [parts addObject:@"Alt"];
    if (flags & NSEventModifierFlagShift) [parts addObject:@"Shift"];
    [parts addObject:key];
    NSString *shortcut = [parts componentsJoinedByString:@"+"];
    NSString *controlID = self.recordingShortcutID ?: @"";
    [self endShortcutRecording];
    SBEmitNativePreferencesAction(@"shortcut", controlID, shortcut);
    return nil;
}

- (void)recordShortcut:(NSButton *)sender {
    [self endShortcutRecording];
    self.recordingShortcutID = sender.identifier ?: @"";
    self.shortcutHint.stringValue =
        self.strings[@"shortcutHint"] ?: @"Press the shortcut now.";
    self.shortcutHint.textColor = NSColor.secondaryLabelColor;
    [self.shortcutTable reloadData];
    __weak SBNativePreferencesController *weakSelf = self;
    self.shortcutMonitor =
        [NSEvent addLocalMonitorForEventsMatchingMask:NSEventMaskKeyDown
                                               handler:^NSEvent *(NSEvent *event) {
            return [weakSelf handleShortcutEvent:event];
        }];
}

- (void)clearShortcut:(NSButton *)sender {
    [self endShortcutRecording];
    SBEmitNativePreferencesAction(@"shortcut", sender.identifier ?: @"", @"");
}

- (void)windowWillClose:(NSNotification *)notification {
    [self endShortcutRecording];
    SBRestorePreviousApplicationAfterPopover();
}

@end

int sb_accessibility_is_trusted(void) {
    return AXIsProcessTrusted() ? 1 : 0;
}

int sb_accessibility_guide_create(void) {
    __block int result = 0;
    SBRunOnMainSync(^{
        if (SBAccessibilityGuide == nil) {
            SBAccessibilityGuide = [SBAccessibilityGuideController new];
        }
        if (SBAccessibilityGuide.panel == nil) result = -1;
    });
    return result;
}

int sb_accessibility_guide_update_json(const char *model_json) {
    if (model_json == NULL) return -2;
    NSData *data = [[NSData alloc] initWithBytes:model_json length:strlen(model_json)];
    NSError *error = nil;
    id model = [NSJSONSerialization JSONObjectWithData:data options:0 error:&error];
    if (![model isKindOfClass:NSDictionary.class] || error != nil) return -3;

    __block int result = 0;
    SBRunOnMainSync(^{
        if (SBAccessibilityGuide == nil) {
            SBAccessibilityGuide = [SBAccessibilityGuideController new];
        }
        if (SBAccessibilityGuide == nil) {
            result = -1;
            return;
        }
        [SBAccessibilityGuide updateModel:model];
    });
    return result;
}

int sb_accessibility_guide_show(void) {
    __block int result = 0;
    SBRunOnMainSync(^{
        if (AXIsProcessTrusted()) return;
        if (SBAccessibilityGuide == nil) {
            SBAccessibilityGuide = [SBAccessibilityGuideController new];
        }
        if (SBAccessibilityGuide == nil) {
            result = -1;
            return;
        }
        [SBAccessibilityGuide showOpeningSystemSettings:YES];
    });
    return result;
}

void sb_accessibility_guide_hide(void) {
    SBRunOnMainSync(^{
        [SBAccessibilityGuide hide];
    });
}

int sb_status_item_create(SBStatusItemCallback callback) {
    __block int result = 0;
    SBRunOnMainSync(^{
        // A menu-bar-only accessory has no ordinary visible window, so AppKit
        // may otherwise mark it eligible for automatic termination shortly
        // after launch. The status item is the application; keep its process
        // alive until the user explicitly chooses Quit.
        [NSProcessInfo.processInfo
            disableAutomaticTermination:@"OneTouch menu bar controls are active"];
        [NSProcessInfo.processInfo disableSuddenTermination];
        SBStatusCallback = callback;
        if (SBStatusItem == nil) {
            SBStatusTargetInstance = [SBStatusTarget new];
            SBStatusItem = [NSStatusBar.systemStatusBar statusItemWithLength:24.0];
        }
        if (SBStatusItem.button == nil) {
            result = -1;
            return;
        }
        // Establish a visible, title-backed button immediately. On macOS 26,
        // assigning autosaveName to this third-party item parks it in a
        // screen-edge holding window even when its visibility defaults are
        // true. Recreate this single process-owned item on every launch
        // instead of restoring the broken system layout identity.
        SBUpdateStatusImage();
        // A variable-length item with an image-only button can collapse to a
        // zero-width slot on macOS 26 after Control Center restores its saved
        // layout. Keep a small, explicit hit target so "visible" also means
        // visibly present in the menu bar.
        SBStatusItem.button.target = SBStatusTargetInstance;
        SBStatusItem.button.action = @selector(clicked:);
        SBStatusItem.button.toolTip = @"OneTouch";
        SBStatusItem.button.enabled = YES;
        SBStatusItem.button.hidden = NO;
        SBStatusItem.button.alphaValue = 1.0;
        [SBStatusItem.button sendActionOn:NSEventMaskLeftMouseUp];
    });
    return result;
}

int sb_status_item_is_visible(void) {
    __block int visible = 0;
    SBRunOnMainSync(^{
        visible = SBStatusItem != nil && SBStatusItem.isVisible &&
                  SBStatusItem.button != nil && !SBStatusItem.button.isHidden &&
                  SBStatusItem.button.alphaValue > 0.0 &&
                  SBStatusItem.length >= 22.0;
    });
    return visible;
}

int sb_status_item_has_screen_anchor(void) {
    __block int visible = 0;
    SBRunOnMainSync(^{
        visible = SBStatusItemHasScreenAnchor() ? 1 : 0;
    });
    return visible;
}

int sb_native_popover_create(SBNativePopoverCallback callback) {
    __block int result = 0;
    SBRunOnMainSync(^{
        SBNativePopoverActionCallback = callback;
        if (SBNativePopoverPanel == nil) {
            SBNativePopoverController *controller = [SBNativePopoverController new];
            NSWindowStyleMask style = NSWindowStyleMaskTitled |
                                      NSWindowStyleMaskFullSizeContentView |
                                      NSWindowStyleMaskNonactivatingPanel;
            SBNativePopoverPanel = [[SBNativePopoverPanelWindow alloc]
                initWithContentRect:NSMakeRect(0, 0, SBNativePopoverWidth, 560.0)
                          styleMask:style
                            backing:NSBackingStoreBuffered
                              defer:NO];
            SBNativePopoverPanel.contentViewController = controller;
            SBNativePopoverPanel.title = @"OneTouch";
            SBNativePopoverPanel.titleVisibility = NSWindowTitleHidden;
            SBNativePopoverPanel.titlebarAppearsTransparent = YES;
            SBNativePopoverPanel.floatingPanel = YES;
            SBNativePopoverPanel.becomesKeyOnlyIfNeeded = YES;
            SBNativePopoverPanel.hidesOnDeactivate = NO;
            SBNativePopoverPanel.movable = NO;
            SBNativePopoverPanel.releasedWhenClosed = NO;
            SBNativePopoverPanel.excludedFromWindowsMenu = YES;
            SBNativePopoverPanel.level = NSStatusWindowLevel;
            SBNativePopoverPanel.animationBehavior = NSWindowAnimationBehaviorUtilityWindow;
            SBNativePopoverPanel.collectionBehavior =
                NSWindowCollectionBehaviorCanJoinAllSpaces |
                NSWindowCollectionBehaviorFullScreenAuxiliary |
                NSWindowCollectionBehaviorTransient |
                NSWindowCollectionBehaviorIgnoresCycle;
            SBNativePopoverPanel.opaque = NO;
            SBNativePopoverPanel.backgroundColor = NSColor.clearColor;
            SBNativePopoverPanel.hasShadow = YES;
            [SBNativePopoverPanel standardWindowButton:NSWindowCloseButton].hidden = YES;
            [SBNativePopoverPanel standardWindowButton:NSWindowMiniaturizeButton].hidden = YES;
            [SBNativePopoverPanel standardWindowButton:NSWindowZoomButton].hidden = YES;
            if (@available(macOS 11.0, *)) {
                SBNativePopoverPanel.titlebarSeparatorStyle = NSTitlebarSeparatorStyleNone;
            }
            SBInstallNativePopoverEventMonitors();
            [controller applyModel:@{
                @"language": @"zh",
                @"title": @"OneTouch",
                @"subtitle": @"正在读取系统状态…",
                @"settingsLabel": @"设置",
                @"customiseLabel": @"自定义",
                @"quitLabel": @"退出",
                @"rows": @[],
            }];
        }
        if (SBNativePopoverPanel.contentViewController == nil) result = -1;
    });
    return result;
}

int sb_native_popover_update_json(const char *model_json) {
    if (model_json == NULL) return -2;
    NSData *data = [[NSData alloc] initWithBytes:model_json length:strlen(model_json)];
    NSError *error = nil;
    id model = [NSJSONSerialization JSONObjectWithData:data options:0 error:&error];
    if (![model isKindOfClass:NSDictionary.class] || error != nil) return -3;

    __block int result = 0;
    SBRunOnMainSync(^{
        SBNativePopoverController *controller =
            [SBNativePopoverPanel.contentViewController isKindOfClass:SBNativePopoverController.class]
                ? (SBNativePopoverController *)SBNativePopoverPanel.contentViewController
                : nil;
        if (controller == nil) {
            result = -1;
            return;
        }
        NSArray *rows = [model[@"rows"] isKindOfClass:NSArray.class]
            ? model[@"rows"]
            : @[];
        NSUInteger visibleRows = MIN(rows.count, SBNativeVisibleRowCapacity);
        CGFloat height = SBNativeHeaderHeight +
                         visibleRows * SBNativeRowHeight +
                         SBNativeFooterHeight +
                         2.0 * SBNativeSeparatorHeight;
        NSSize targetSize = NSMakeSize(SBNativePopoverWidth, height);
        if (!NSEqualSizes(SBNativePopoverPanel.contentView.frame.size, targetSize)) {
            [SBNativePopoverPanel setContentSize:targetSize];
            if (SBNativePopoverPanel.isVisible) SBPositionNativePopoverPanel();
        }
        [controller applyModel:model];
    });
    return result;
}

int sb_native_popover_show(void) {
    __block int result = 0;
    SBRunOnMainSync(^{
        NSButton *button = SBStatusItem.button;
        if (SBNativePopoverPanel == nil || button == nil) {
            result = -1;
            return;
        }
        if (!SBStatusItemHasScreenAnchor()) {
            result = -2;
            return;
        }
        SBShowNativePopover(NO);
    });
    return result;
}

int sb_native_popover_show_persistent(void) {
    __block int result = 0;
    SBRunOnMainSync(^{
        NSButton *button = SBStatusItem.button;
        if (SBNativePopoverPanel == nil || button == nil) {
            result = -1;
            return;
        }
        if (!SBStatusItemHasScreenAnchor()) {
            result = -2;
            return;
        }
        SBShowNativePopover(YES);
    });
    return result;
}

int sb_native_popover_toggle(void) {
    __block int result = 0;
    SBRunOnMainSync(^{
        NSButton *button = SBStatusItem.button;
        if (SBNativePopoverPanel == nil || button == nil) {
            result = -1;
            return;
        }
        if (!SBStatusItemHasScreenAnchor()) {
            result = -2;
            return;
        }
        if (SBNativePopoverPanel.isVisible) {
            SBHideNativePopover(YES);
        } else {
            SBShowNativePopover(NO);
        }
    });
    return result;
}

void sb_native_popover_hide(void) {
    SBRunOnMainSync(^{
        SBHideNativePopover(YES);
    });
}

void sb_native_popover_hide_for_app_window(void) {
    SBRunOnMainSync(^{
        if (SBNativePopoverPanel.isVisible) {
            // Opening an app-owned window is a continuation of the menu
            // interaction. Do not reactivate the app that was frontmost before
            // the menu and immediately bury Preferences.
            SBHideNativePopover(NO);
        }
    });
}

void sb_native_app_activate(void) {
    SBRunOnMainSync(^{
        [NSApp activateIgnoringOtherApps:YES];
    });
}

void sb_native_restore_previous_application(void) {
    SBRunOnMainSync(^{
        SBRestorePreviousApplicationAfterPopover();
    });
}

int sb_native_preferences_create(SBNativePreferencesCallback callback) {
    __block int result = 0;
    SBRunOnMainSync(^{
        SBNativePreferencesActionCallback = callback;
        if (SBNativePreferencesWindowController != nil) return;

        SBNativePreferencesController *controller =
            [SBNativePreferencesController new];
        NSWindowStyleMask style =
            NSWindowStyleMaskTitled | NSWindowStyleMaskClosable;
        NSWindow *window =
            [[NSWindow alloc] initWithContentRect:
                NSMakeRect(0, 0, SBNativePreferencesContentWidth,
                           SBNativePreferencesListHeight)
                                       styleMask:style
                                         backing:NSBackingStoreBuffered
                                           defer:NO];
        window.title = @"通用";
        window.titleVisibility = NSWindowTitleVisible;
        window.tabbingMode = NSWindowTabbingModeDisallowed;
        window.releasedWhenClosed = NO;
        window.animationBehavior = NSWindowAnimationBehaviorDocumentWindow;
        window.delegate = controller;
        if (@available(macOS 11.0, *)) {
            // Preference is AppKit's dedicated Settings-window layout: it keeps
            // the centred pane title above an evenly-spaced native tab toolbar.
            window.toolbarStyle = NSWindowToolbarStylePreference;
        }
        window.contentViewController = controller;
        window.toolbar.displayMode = NSToolbarDisplayModeIconAndLabel;
        window.toolbar.sizeMode = NSToolbarSizeModeRegular;
        SBNativePreferencesWindowController =
            [[NSWindowController alloc] initWithWindow:window];
        [window center];

        [controller applyModel:@{
            @"language": @"zh",
            @"githubURL": @"",
            @"update": @{ @"phase": @"idle", @"title": @"检查更新…", @"status": @"" },
            @"startAtLogin": @NO,
            @"startAtLoginLoading": @YES,
            @"rows": @[],
            @"strings": @{
                @"title": @"OneTouch 设置",
                @"general": @"通用",
                @"customise": @"自定义",
                @"shortcuts": @"快捷键",
                @"about": @"关于",
                @"language": @"语言",
                @"startAtLogin": @"登录时启动",
                @"startAtLoginNote": @"正在读取登录启动设置…",
                @"saved": @"更改会自动保存在这台 Mac 上。",
                @"customiseIntro": @"选择要显示的控制项，并拖动调整顺序。",
                @"visibleCount": @"已选择 %ld",
                @"searchControls": @"搜索控制项",
                @"shortcutIntro": @"为任意控制项录制全局快捷键。",
                @"shortcutRecord": @"录制",
                @"shortcutRecording": @"请按快捷键…",
                @"shortcutClear": @"清除快捷键",
                @"shortcutHint": @"请组合使用 ⌘、⌃ 或 ⌥；Delete 清除，Esc 取消。",
                @"shortcutNeedsModifier": @"请加入 Command、Control 或 Option。",
                @"shortcutNeedsKey": @"请同时按下一个非修饰键。",
                @"aboutTitle": @"OneTouch",
                @"version": @"版本 %@",
                @"github": @"GitHub",
                @"githubPending": @"GitHub 链接稍后添加",
                @"checkForUpdates": @"检查更新…",
            },
        }];
        if (SBNativePreferencesWindowController.window == nil) result = -1;
    });
    return result;
}

int sb_native_preferences_update_json(const char *model_json) {
    if (model_json == NULL) return -2;
    NSData *data = [[NSData alloc] initWithBytes:model_json length:strlen(model_json)];
    NSError *error = nil;
    id model = [NSJSONSerialization JSONObjectWithData:data options:0 error:&error];
    if (![model isKindOfClass:NSDictionary.class] || error != nil) return -3;

    __block int result = 0;
    SBRunOnMainSync(^{
        SBNativePreferencesController *controller =
            [SBNativePreferencesWindowController.window.contentViewController
                isKindOfClass:SBNativePreferencesController.class]
                ? (SBNativePreferencesController *)
                    SBNativePreferencesWindowController.window.contentViewController
                : nil;
        if (controller == nil) {
            result = -1;
            return;
        }
        [controller applyModel:model];
    });
    return result;
}

int sb_native_preferences_show(void) {
    __block int result = 0;
    SBRunOnMainSync(^{
        NSWindow *window = SBNativePreferencesWindowController.window;
        if (window == nil) {
            result = -1;
            return;
        }
        [NSApp activateIgnoringOtherApps:YES];
        [SBNativePreferencesWindowController showWindow:nil];
        [window makeKeyAndOrderFront:nil];
        SBNativePreferencesController *controller =
            [window.contentViewController isKindOfClass:SBNativePreferencesController.class]
                ? (SBNativePreferencesController *)window.contentViewController
                : nil;
        [controller resizeWindowForSelectedTabAnimated:NO];
        // AppKit can restore the previously selected toolbar item after the
        // window becomes visible. Re-read that final selection on the next run
        // loop so a restored list pane never inherits the compact General size.
        dispatch_async(dispatch_get_main_queue(), ^{
            if (window.isVisible) {
                [controller resizeWindowForSelectedTabAnimated:NO];
            }
        });
    });
    return result;
}

void sb_native_preferences_hide(void) {
    SBRunOnMainSync(^{
        [SBNativePreferencesWindowController close];
    });
}

int sb_timer_menu_show(void *window_pointer, double anchor_right, double anchor_bottom,
                       int use_chinese) {
    if (window_pointer == NULL) return -2;

    __block int selected = -1;
    SBRunOnMainSync(^{
        NSWindow *window = (__bridge NSWindow *)window_pointer;
        NSView *contentView = window.contentView;
        if (contentView == nil) {
            selected = -2;
            return;
        }

        NSArray<NSString *> *titles = use_chinese
            ? @[@"30 分钟", @"1 小时", @"2 小时", @"4 小时", @"直到今天结束", @"不定时"]
            : @[@"30 Minutes", @"1 Hour", @"2 Hours", @"4 Hours", @"Until End of Day", @"No Timer"];
        SBTimerMenuTarget *target = [SBTimerMenuTarget new];
        NSMenu *menu = [[NSMenu alloc] initWithTitle:@""];
        menu.autoenablesItems = NO;
        menu.minimumWidth = 154.0;

        for (NSUInteger index = 0; index < titles.count; index += 1) {
            if (index == 5) [menu addItem:NSMenuItem.separatorItem];
            NSMenuItem *item = [[NSMenuItem alloc] initWithTitle:titles[index]
                                                          action:@selector(selectDuration:)
                                                   keyEquivalent:@""];
            item.target = target;
            item.tag = index;
            item.enabled = YES;
            [menu addItem:item];
        }

        [menu update];
        NSSize menuSize = menu.size;
        CGFloat menuWidth = MAX(menuSize.width, menu.minimumWidth);
        NSRect bounds = contentView.bounds;
        CGFloat x = MIN(MAX(anchor_right - menuWidth, NSMinX(bounds) + 4.0),
                        NSMaxX(bounds) - menuWidth - 4.0);
        CGFloat y = NSMaxY(bounds) - anchor_bottom - 5.0;
        [menu popUpMenuPositioningItem:nil
                           atLocation:NSMakePoint(x, y)
                               inView:contentView];
        selected = (int)target.selectedTag;
    });
    return selected;
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
    if (!AXIsProcessTrusted()) {
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

        if (!AXIsProcessTrusted()) {
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
            SBEmitNativePopoverAction(@"state", @"cleanScreen", 1);
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
        SBEmitNativePopoverAction(@"state", @"cleanScreen", 0);
    });
}

int sb_clean_screen_active(void) {
    return SBCleanActive ? 1 : 0;
}

static CGEventRef SBKeyboardCallback(CGEventTapProxy proxy, CGEventType type, CGEventRef event, void *context) {
    (void)proxy; (void)context;
    if (type == kCGEventTapDisabledByTimeout || type == kCGEventTapDisabledByUserInput) {
        if (SBKeyboardTap) CGEventTapEnable(SBKeyboardTap, true);
        return event;
    }
    // Keyboard cleaning intentionally swallows every keyboard-originated event
    // covered by the tap. The mouse remains available so the menu-bar switch is
    // always the recovery path. Power and Touch ID are hardware-managed and
    // never enter this event tap.
    return NULL;
}

int sb_keyboard_lock_start(char **error_output) {
    if (SBKeyboardActive) return 0;
    if (!AXIsProcessTrusted()) {
        SBCopyError(error_output, @"Accessibility permission is required for keyboard cleaning");
        return -1;
    }

    dispatch_semaphore_t ready = dispatch_semaphore_create(0);
    __block BOOL started = NO;
    [NSThread detachNewThreadWithBlock:^{
        @autoreleasepool {
            CGEventMask mask = CGEventMaskBit(kCGEventKeyDown) |
                               CGEventMaskBit(kCGEventKeyUp) |
                               CGEventMaskBit(kCGEventFlagsChanged) |
                               CGEventMaskBit((CGEventType)NX_SYSDEFINED);
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
        SBCopyError(error_output, @"macOS could not start keyboard cleaning mode");
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
