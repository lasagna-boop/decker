import AppKit
import Foundation

private let agentPort = 4242
private let expoPort = 8081
private let agentHealthURL = URL(string: "http://127.0.0.1:\(agentPort)/health")!
private let expoProbeURL = URL(string: "http://127.0.0.1:\(expoPort)")!

private enum Palette {
  static let bg = NSColor(calibratedRed: 0.07, green: 0.07, blue: 0.08, alpha: 1)
  static let panel = NSColor(calibratedRed: 0.11, green: 0.11, blue: 0.12, alpha: 1)
  static let cyan = NSColor(calibratedRed: 0.0, green: 0.90, blue: 1.0, alpha: 1)
  static let cream = NSColor(calibratedRed: 0.94, green: 0.93, blue: 0.90, alpha: 1)
  static let dim = NSColor(calibratedRed: 0.45, green: 0.45, blue: 0.48, alpha: 1)
  static let green = NSColor(calibratedRed: 0.20, green: 0.85, blue: 0.45, alpha: 1)
  static let red = NSColor(calibratedRed: 1.0, green: 0.30, blue: 0.18, alpha: 1)
  static let line = NSColor(calibratedRed: 1, green: 1, blue: 1, alpha: 0.08)
}

@main
enum DeckerMacMain {
  static func main() {
    let app = NSApplication.shared
    let delegate = AppDelegate()
    app.delegate = delegate
    app.setActivationPolicy(.regular)
    app.run()
  }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
  private var window: NSWindow!
  private var agentProcess: Process?
  private var expoProcess: Process?
  private var startedAgentByUs = false
  private var startedExpoByUs = false
  private var pollTimer: Timer?

  private var macName = "Mac"
  private var localIP = "—"
  private var agentRunning = false
  private var expoRunning = false

  private let brandLabel = NSTextField(labelWithString: "DECKER")
  private let statusDot = NSView()
  private let statusLabel = NSTextField(labelWithString: "STARTING…")
  private let nameLabel = NSTextField(labelWithString: "—")
  private let agentLine = NSTextField(labelWithString: "Agent · …")
  private let expoLine = NSTextField(labelWithString: "Expo · …")
  private let phoneLine = NSTextField(labelWithString: "Phone · …")
  private let hintLabel = NSTextField(wrappingLabelWithString: "Starting agent + Expo so your iPhone can connect…")
  private let primaryButton = NSButton(title: "Start everything", target: nil, action: nil)
  private let restartButton = NSButton(title: "Restart", target: nil, action: nil)

  private lazy var repoRoot: URL = {
    if let env = ProcessInfo.processInfo.environment["DECKER_ROOT"], !env.isEmpty {
      return URL(fileURLWithPath: env, isDirectory: true)
    }
    let candidates = [
      URL(fileURLWithPath: FileManager.default.currentDirectoryPath, isDirectory: true),
      Bundle.main.bundleURL
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .deletingLastPathComponent(),
      Bundle.main.bundleURL.deletingLastPathComponent(),
    ]
    for start in candidates {
      var url = start
      for _ in 0..<8 {
        let agent = url.appendingPathComponent("agent/index.js")
        if FileManager.default.fileExists(atPath: agent.path) { return url }
        url.deleteLastPathComponent()
      }
    }
    return URL(fileURLWithPath: FileManager.default.currentDirectoryPath, isDirectory: true)
  }()

  func applicationDidFinishLaunching(_ notification: Notification) {
    buildWindow()
    startEverything()
    refreshStatus()

    let timer = Timer(timeInterval: 1.5, repeats: true) { [weak self] _ in
      self?.refreshStatus()
    }
    RunLoop.main.add(timer, forMode: .common)
    pollTimer = timer

    NSApp.activate(ignoringOtherApps: true)
  }

  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
    true
  }

  func applicationWillTerminate(_ notification: Notification) {
    pollTimer?.invalidate()
    stopEverything(killOrphans: true)
  }

  // MARK: - Window UI

  private func buildWindow() {
    let size = NSSize(width: 400, height: 540)
    window = NSWindow(
      contentRect: NSRect(origin: .zero, size: size),
      styleMask: [.titled, .closable, .miniaturizable],
      backing: .buffered,
      defer: false
    )
    window.title = "Decker"
    window.isReleasedWhenClosed = false
    window.backgroundColor = Palette.bg
    window.titlebarAppearsTransparent = true
    window.center()

    let root = NSView(frame: NSRect(origin: .zero, size: size))
    root.wantsLayer = true
    root.layer?.backgroundColor = Palette.bg.cgColor

    let brand = NSMutableAttributedString(string: "DECKER")
    brand.addAttributes([
      .font: NSFont.systemFont(ofSize: 28, weight: .bold),
      .foregroundColor: Palette.cyan,
      .kern: 6,
    ], range: NSRange(location: 0, length: brand.length))
    brandLabel.attributedStringValue = brand
    brandLabel.alignment = .center

    statusDot.wantsLayer = true
    statusDot.layer?.cornerRadius = 6
    statusDot.layer?.backgroundColor = Palette.dim.cgColor

    statusLabel.font = NSFont.systemFont(ofSize: 13, weight: .semibold)
    statusLabel.textColor = Palette.dim

    let statusRow = NSStackView(views: [statusDot, statusLabel])
    statusRow.orientation = .horizontal
    statusRow.alignment = .centerY
    statusRow.spacing = 10
    statusDot.translatesAutoresizingMaskIntoConstraints = false
    NSLayoutConstraint.activate([
      statusDot.widthAnchor.constraint(equalToConstant: 12),
      statusDot.heightAnchor.constraint(equalToConstant: 12),
    ])

    configureMeta(nameLabel, size: 20, weight: .semibold, color: Palette.cream)
    nameLabel.alignment = .center
    configureMeta(agentLine, size: 13, weight: .medium, color: Palette.dim)
    agentLine.alignment = .center
    configureMeta(expoLine, size: 13, weight: .medium, color: Palette.dim)
    expoLine.alignment = .center
    configureMeta(phoneLine, size: 12, weight: .regular, color: Palette.cyan)
    phoneLine.alignment = .center

    hintLabel.font = NSFont.systemFont(ofSize: 12, weight: .regular)
    hintLabel.textColor = Palette.dim
    hintLabel.alignment = .center
    hintLabel.maximumNumberOfLines = 4

    stylePrimaryButton(primaryButton)
    primaryButton.target = self
    primaryButton.action = #selector(toggleEverything)

    styleGhostButton(restartButton)
    restartButton.target = self
    restartButton.action = #selector(restartEverything)

    let card = NSView()
    card.wantsLayer = true
    card.layer?.backgroundColor = Palette.panel.cgColor
    card.layer?.cornerRadius = 18
    card.layer?.borderWidth = 1
    card.layer?.borderColor = Palette.line.cgColor

    let cardStack = NSStackView(views: [statusRow, nameLabel, agentLine, expoLine, phoneLine])
    cardStack.orientation = .vertical
    cardStack.alignment = .centerX
    cardStack.spacing = 10
    cardStack.edgeInsets = NSEdgeInsets(top: 28, left: 20, bottom: 28, right: 20)
    cardStack.translatesAutoresizingMaskIntoConstraints = false
    card.addSubview(cardStack)

    let buttons = NSStackView(views: [primaryButton, restartButton])
    buttons.orientation = .vertical
    buttons.spacing = 10

    let outer = NSStackView(views: [brandLabel, card, hintLabel, buttons])
    outer.orientation = .vertical
    outer.alignment = .centerX
    outer.spacing = 20
    outer.translatesAutoresizingMaskIntoConstraints = false
    root.addSubview(outer)

    NSLayoutConstraint.activate([
      outer.leadingAnchor.constraint(equalTo: root.leadingAnchor, constant: 28),
      outer.trailingAnchor.constraint(equalTo: root.trailingAnchor, constant: -28),
      outer.topAnchor.constraint(equalTo: root.topAnchor, constant: 36),
      outer.bottomAnchor.constraint(lessThanOrEqualTo: root.bottomAnchor, constant: -28),

      card.widthAnchor.constraint(equalTo: outer.widthAnchor),
      cardStack.leadingAnchor.constraint(equalTo: card.leadingAnchor),
      cardStack.trailingAnchor.constraint(equalTo: card.trailingAnchor),
      cardStack.topAnchor.constraint(equalTo: card.topAnchor),
      cardStack.bottomAnchor.constraint(equalTo: card.bottomAnchor),

      buttons.widthAnchor.constraint(equalTo: outer.widthAnchor),
      primaryButton.heightAnchor.constraint(equalToConstant: 44),
      restartButton.heightAnchor.constraint(equalToConstant: 40),
    ])

    window.contentView = root
    window.makeKeyAndOrderFront(nil)
  }

  private func configureMeta(_ field: NSTextField, size: CGFloat, weight: NSFont.Weight, color: NSColor) {
    field.font = NSFont.systemFont(ofSize: size, weight: weight)
    field.textColor = color
    field.lineBreakMode = .byTruncatingMiddle
    field.maximumNumberOfLines = 2
  }

  private func stylePrimaryButton(_ button: NSButton) {
    button.bezelStyle = .rounded
    button.isBordered = false
    button.wantsLayer = true
    button.layer?.cornerRadius = 12
    button.layer?.backgroundColor = Palette.cyan.cgColor
    button.contentTintColor = .black
    button.font = NSFont.systemFont(ofSize: 15, weight: .bold)
    button.focusRingType = .none
  }

  private func styleGhostButton(_ button: NSButton) {
    button.bezelStyle = .rounded
    button.isBordered = false
    button.wantsLayer = true
    button.layer?.cornerRadius = 12
    button.layer?.backgroundColor = NSColor(calibratedWhite: 1, alpha: 0.06).cgColor
    button.layer?.borderWidth = 1
    button.layer?.borderColor = Palette.line.cgColor
    button.contentTintColor = Palette.cream
    button.font = NSFont.systemFont(ofSize: 14, weight: .semibold)
    button.focusRingType = .none
  }

  private func renderUI() {
    let ready = agentRunning && expoRunning
    if ready {
      statusDot.layer?.backgroundColor = Palette.green.cgColor
      statusLabel.stringValue = "READY FOR IPHONE"
      statusLabel.textColor = Palette.green
      primaryButton.title = "Stop everything"
      primaryButton.layer?.backgroundColor = Palette.red.withAlphaComponent(0.85).cgColor
      primaryButton.contentTintColor = .white
      hintLabel.stringValue = "Open Expo Go on iPhone → scan QR from Metro, or reopen recent project. Decker agent is discoverable on Wi‑Fi."
    } else if agentRunning || expoRunning {
      statusDot.layer?.backgroundColor = Palette.cyan.cgColor
      statusLabel.stringValue = "STARTING…"
      statusLabel.textColor = Palette.cyan
      primaryButton.title = "Stop everything"
      primaryButton.layer?.backgroundColor = Palette.red.withAlphaComponent(0.85).cgColor
      primaryButton.contentTintColor = .white
      hintLabel.stringValue = "Waiting for agent and Expo Metro…"
    } else {
      statusDot.layer?.backgroundColor = Palette.dim.cgColor
      statusLabel.stringValue = "OFFLINE"
      statusLabel.textColor = Palette.dim
      primaryButton.title = "Start everything"
      primaryButton.layer?.backgroundColor = Palette.cyan.cgColor
      primaryButton.contentTintColor = .black
      hintLabel.stringValue = "Starts the Mac agent (Bonjour :\(agentPort)) and Expo Metro (:\(expoPort)) together."
    }

    nameLabel.stringValue = macName
    agentLine.stringValue = agentRunning
      ? "Agent · on · \(localIP):\(agentPort)"
      : "Agent · off"
    agentLine.textColor = agentRunning ? Palette.cream : Palette.dim

    expoLine.stringValue = expoRunning ? "Expo · on · :\(expoPort)" : "Expo · off"
    expoLine.textColor = expoRunning ? Palette.cream : Palette.dim

    if expoRunning, localIP != "—" {
      phoneLine.stringValue = "exp://\(localIP):\(expoPort)"
      phoneLine.textColor = Palette.cyan
    } else {
      phoneLine.stringValue = "Phone link · waiting"
      phoneLine.textColor = Palette.dim
    }
  }

  // MARK: - Actions

  @objc private func toggleEverything() {
    if agentRunning || expoRunning {
      stopEverything(killOrphans: true)
      refreshStatus()
    } else {
      startEverything()
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { [weak self] in
        self?.refreshStatus()
      }
    }
  }

  @objc private func restartEverything() {
    stopEverything(killOrphans: true)
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { [weak self] in
      self?.startEverything()
      self?.refreshStatus()
    }
  }

  private func startEverything() {
    ensureAgentRunning()
    ensureExpoRunning()
  }

  private func stopEverything(killOrphans: Bool) {
    if startedAgentByUs || killOrphans {
      stopAgent()
      freePort(agentPort)
      startedAgentByUs = false
    }
    if startedExpoByUs || killOrphans {
      stopExpo()
      freePort(expoPort)
      startedExpoByUs = false
    }
  }

  // MARK: - Agent

  private func ensureAgentRunning() {
    if probeAgent() != nil {
      agentRunning = true
      return
    }
    startAgentProcess()
  }

  private func startAgentProcess() {
    let agentJS = repoRoot.appendingPathComponent("agent/index.js")
    guard FileManager.default.fileExists(atPath: agentJS.path) else {
      presentAlert(title: "Agent not found", message: "Expected \(agentJS.path)")
      return
    }
    guard let node = resolveBin("node") else {
      presentAlert(title: "Node.js not found", message: "Install Node.js, then try again.")
      return
    }

    ensureNpmInstall(in: repoRoot.appendingPathComponent("agent"))

    let process = Process()
    process.executableURL = URL(fileURLWithPath: node)
    process.arguments = [agentJS.path]
    process.currentDirectoryURL = repoRoot.appendingPathComponent("agent")
    process.environment = processEnvironment()
    attachLogs(process, out: "decker-mac-agent.log", err: "decker-mac-agent.err.log")

    do {
      try process.run()
      agentProcess = process
      startedAgentByUs = true
    } catch {
      presentAlert(title: "Failed to start agent", message: error.localizedDescription)
    }
  }

  private func stopAgent() {
    if let process = agentProcess, process.isRunning {
      process.terminate()
      process.waitUntilExit()
    }
    agentProcess = nil
  }

  // MARK: - Expo

  private func ensureExpoRunning() {
    if probeExpo() {
      expoRunning = true
      return
    }
    startExpoProcess()
  }

  private func startExpoProcess() {
    let mobileDir = repoRoot.appendingPathComponent("mobile")
    guard FileManager.default.fileExists(atPath: mobileDir.appendingPathComponent("package.json").path) else {
      presentAlert(title: "Mobile app not found", message: "Expected \(mobileDir.path)")
      return
    }
    guard let npx = resolveBin("npx") else {
      presentAlert(title: "npx not found", message: "Install Node.js (includes npx).")
      return
    }

    ensureNpmInstall(in: mobileDir)

    let process = Process()
    process.executableURL = URL(fileURLWithPath: npx)
    process.arguments = ["expo", "start", "--lan"]
    process.currentDirectoryURL = mobileDir
    process.environment = processEnvironment()
    attachLogs(process, out: "decker-mac-expo.log", err: "decker-mac-expo.err.log")

    do {
      try process.run()
      expoProcess = process
      startedExpoByUs = true
    } catch {
      presentAlert(title: "Failed to start Expo", message: error.localizedDescription)
    }
  }

  private func stopExpo() {
    if let process = expoProcess, process.isRunning {
      process.terminate()
      process.waitUntilExit()
    }
    expoProcess = nil
  }

  // MARK: - Shared helpers

  private func processEnvironment() -> [String: String] {
    var env = ProcessInfo.processInfo.environment
    let extras = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
    if let path = env["PATH"], !path.isEmpty {
      env["PATH"] = extras + ":" + path
    } else {
      env["PATH"] = extras
    }
    env["CI"] = "1"
    env["EXPO_NO_TELEMETRY"] = "1"
    env["DECKER_ROOT"] = repoRoot.path
    return env
  }

  private func ensureNpmInstall(in dir: URL) {
    let modules = dir.appendingPathComponent("node_modules")
    guard !FileManager.default.fileExists(atPath: modules.path) else { return }
    guard let npm = resolveBin("npm") else { return }
    let npmProc = Process()
    npmProc.executableURL = URL(fileURLWithPath: npm)
    npmProc.arguments = ["install"]
    npmProc.currentDirectoryURL = dir
    npmProc.environment = processEnvironment()
    try? npmProc.run()
    npmProc.waitUntilExit()
  }

  private func attachLogs(_ process: Process, out: String, err: String) {
    let logDir = FileManager.default.homeDirectoryForCurrentUser
      .appendingPathComponent("Library/Logs", isDirectory: true)
    try? FileManager.default.createDirectory(at: logDir, withIntermediateDirectories: true)
    let outLog = logDir.appendingPathComponent(out)
    let errLog = logDir.appendingPathComponent(err)
    FileManager.default.createFile(atPath: outLog.path, contents: nil)
    FileManager.default.createFile(atPath: errLog.path, contents: nil)
    process.standardOutput = try? FileHandle(forWritingTo: outLog)
    process.standardError = try? FileHandle(forWritingTo: errLog)
  }

  private func freePort(_ port: Int) {
    let task = Process()
    task.executableURL = URL(fileURLWithPath: "/bin/bash")
    task.arguments = ["-lc", "lsof -ti :\(port) | xargs kill -9 2>/dev/null || true"]
    try? task.run()
    task.waitUntilExit()
  }

  private func resolveBin(_ name: String) -> String? {
    let candidates = [
      "/opt/homebrew/bin/\(name)",
      "/usr/local/bin/\(name)",
    ]
    for path in candidates where FileManager.default.isExecutableFile(atPath: path) {
      return path
    }
    let task = Process()
    task.executableURL = URL(fileURLWithPath: "/usr/bin/which")
    task.arguments = [name]
    let pipe = Pipe()
    task.standardOutput = pipe
    try? task.run()
    task.waitUntilExit()
    let data = pipe.fileHandleForReading.readDataToEndOfFile()
    let path = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines)
    if let path, !path.isEmpty, FileManager.default.isExecutableFile(atPath: path) {
      return path
    }
    return nil
  }

  // MARK: - Status probes

  private struct Health: Decodable {
    let status: String
    let name: String?
  }

  private func probeAgent() -> Health? {
    var request = URLRequest(url: agentHealthURL, timeoutInterval: 0.5)
    request.httpMethod = "GET"
    let sem = DispatchSemaphore(value: 0)
    var result: Health?
    URLSession.shared.dataTask(with: request) { data, response, _ in
      defer { sem.signal() }
      guard
        let data,
        let http = response as? HTTPURLResponse,
        http.statusCode == 200
      else { return }
      result = try? JSONDecoder().decode(Health.self, from: data)
    }.resume()
    _ = sem.wait(timeout: .now() + 0.7)
    return result
  }

  private func probeExpo() -> Bool {
    var request = URLRequest(url: expoProbeURL, timeoutInterval: 0.5)
    request.httpMethod = "GET"
    let sem = DispatchSemaphore(value: 0)
    var ok = false
    URLSession.shared.dataTask(with: request) { _, response, _ in
      defer { sem.signal() }
      if let http = response as? HTTPURLResponse, (200..<500).contains(http.statusCode) {
        ok = true
      }
    }.resume()
    _ = sem.wait(timeout: .now() + 0.7)
    return ok
  }

  private func refreshStatus() {
    if let health = probeAgent(), health.status == "ok" {
      agentRunning = true
      if let name = health.name, !name.isEmpty { macName = name }
      localIP = primaryIPv4() ?? "127.0.0.1"
    } else {
      agentRunning = false
      if let process = agentProcess, !process.isRunning {
        agentProcess = nil
        startedAgentByUs = false
      }
    }

    expoRunning = probeExpo()
    if !expoRunning, let process = expoProcess, !process.isRunning {
      expoProcess = nil
      startedExpoByUs = false
    }

    renderUI()
  }

  private func primaryIPv4() -> String? {
    var address: String?
    var ifaddr: UnsafeMutablePointer<ifaddrs>?
    guard getifaddrs(&ifaddr) == 0, let first = ifaddr else { return nil }
    defer { freeifaddrs(ifaddr) }

    var ptr: UnsafeMutablePointer<ifaddrs>? = first
    while let current = ptr {
      defer { ptr = current.pointee.ifa_next }
      guard let iface = current.pointee.ifa_addr else { continue }
      guard iface.pointee.sa_family == UInt8(AF_INET) else { continue }
      let name = String(cString: current.pointee.ifa_name)
      guard name.hasPrefix("en") || name.hasPrefix("bridge") else { continue }
      var hostname = [CChar](repeating: 0, count: Int(NI_MAXHOST))
      let ok = getnameinfo(
        iface,
        socklen_t(iface.pointee.sa_len),
        &hostname,
        socklen_t(hostname.count),
        nil,
        0,
        NI_NUMERICHOST
      )
      if ok == 0 {
        let ip = String(cString: hostname)
        if !ip.hasPrefix("127.") {
          address = ip
          break
        }
      }
    }
    return address
  }

  private func presentAlert(title: String, message: String) {
    DispatchQueue.main.async {
      let alert = NSAlert()
      alert.messageText = title
      alert.informativeText = message
      alert.alertStyle = .warning
      alert.runModal()
    }
  }
}
