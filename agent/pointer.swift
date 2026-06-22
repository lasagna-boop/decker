import CoreGraphics
import Foundation

func currentLocation() -> CGPoint {
    CGEvent(source: nil)?.location ?? .zero
}

func moveMouse(dx: Int, dy: Int) {
    guard dx != 0 || dy != 0 else { return }
    var loc = currentLocation()
    loc.x += CGFloat(dx)
    loc.y += CGFloat(dy)
    CGWarpMouseCursorPosition(loc)
    guard let move = CGEvent(
        mouseEventSource: nil,
        mouseType: .mouseMoved,
        mouseCursorPosition: loc,
        mouseButton: .left
    ) else { return }
    move.post(tap: .cghidEventTap)
}

func click(button: CGMouseButton) {
    let loc = currentLocation()
    let downType: CGEventType = button == .right ? .rightMouseDown : .leftMouseDown
    let upType: CGEventType = button == .right ? .rightMouseUp : .leftMouseUp
    if let down = CGEvent(
        mouseEventSource: nil,
        mouseType: downType,
        mouseCursorPosition: loc,
        mouseButton: button
    ) {
        down.post(tap: .cghidEventTap)
    }
    if let up = CGEvent(
        mouseEventSource: nil,
        mouseType: upType,
        mouseCursorPosition: loc,
        mouseButton: button
    ) {
        up.post(tap: .cghidEventTap)
    }
}

func scroll(lines: Int) {
    guard lines != 0 else { return }
    guard let event = CGEvent(
        scrollWheelEvent2Source: nil,
        units: .line,
        wheelCount: 1,
        wheel1: Int32(lines),
        wheel2: 0,
        wheel3: 0
    ) else { return }
    event.post(tap: .cghidEventTap)
}

let args = CommandLine.arguments
guard args.count >= 2 else { exit(1) }

switch args[1] {
case "move":
    guard args.count >= 4 else { exit(1) }
    moveMouse(dx: Int(args[2]) ?? 0, dy: Int(args[3]) ?? 0)
case "click":
    click(button: args.count >= 3 && args[2] == "right" ? .right : .left)
case "scroll":
    guard args.count >= 3 else { exit(1) }
    scroll(lines: Int(args[2]) ?? 0)
default:
    exit(1)
}
