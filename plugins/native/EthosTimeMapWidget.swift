import SwiftUI
import WidgetKit
internal import ExpoWidgets

private let timeMapWidgetKind = "EthosTimeMapWidget"
private let minutesInDay = 24 * 60

private struct TimeMapBlock: Decodable {
  let id: String
  let title: String
  let startTime: String
  let endTime: String
  let breakDurations: [Int]
  let color: String
  let completed: Bool
}

private struct TimeMapAvailableRange: Decodable {
  let start: Int
  let duration: Int
  let fullLabel: String
  let compactLabel: String
}

private struct TimeMapPayload: Decodable {
  let date: String
  let durationLabel: String
  let mapLabel: String
  let backgroundColor: String
  let foregroundColor: String
  let mutedColor: String
  let isDark: Bool
  let boxes: [TimeMapBlock]
  let availableRanges: [TimeMapAvailableRange]

  static let placeholder = TimeMapPayload(
    date: "",
    durationLabel: "8h",
    mapLabel: "SCHEDULED",
    backgroundColor: "#F7FDF9",
    foregroundColor: "#000000",
    mutedColor: "#64748B",
    isDark: false,
    boxes: [
      TimeMapBlock(id: "morning", title: "Morning", startTime: "07:00", endTime: "09:00", breakDurations: [], color: "#5B8CFF", completed: false),
      TimeMapBlock(id: "focus", title: "Focus", startTime: "09:30", endTime: "12:30", breakDurations: [15], color: "#2ECF8F", completed: false),
      TimeMapBlock(id: "afternoon", title: "Afternoon", startTime: "14:00", endTime: "17:00", breakDurations: [], color: "#FF9F43", completed: false),
    ],
    availableRanges: []
  )
}

private struct TimeMapEntry: TimelineEntry {
  let date: Date
  let payload: TimeMapPayload
}

private struct TimeMapProvider: TimelineProvider {
  func placeholder(in context: Context) -> TimeMapEntry {
    TimeMapEntry(date: Date(), payload: .placeholder)
  }

  func getSnapshot(in context: Context, completion: @escaping (TimeMapEntry) -> Void) {
    completion(TimeMapEntry(date: Date(), payload: loadPayload() ?? .placeholder))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<TimeMapEntry>) -> Void) {
    let payload = loadPayload() ?? .placeholder
    let calendar = Calendar.autoupdatingCurrent
    let now = Date()
    let nextHour = calendar.nextDate(
      after: now,
      matching: DateComponents(minute: 0, second: 0),
      matchingPolicy: .nextTime
    ) ?? now.addingTimeInterval(60 * 60)
    var dates = [now]
    dates.append(contentsOf: (0..<24).compactMap { calendar.date(byAdding: .hour, value: $0, to: nextHour) })
    let entries = dates.map { TimeMapEntry(date: $0, payload: payload) }
    completion(Timeline(entries: entries, policy: .atEnd))
  }

  private func loadPayload() -> TimeMapPayload? {
    guard
      let timeline = WidgetsStorage.getArray(forKey: "__expo_widgets_\(timeMapWidgetKind)_timeline") as? [[String: Any]],
      let props = timeline.last?["props"] as? [String: Any],
      let data = try? JSONSerialization.data(withJSONObject: props)
    else {
      return nil
    }
    return try? JSONDecoder().decode(TimeMapPayload.self, from: data)
  }
}

private struct TimeMapPoint {
  let x: CGFloat
  let y: CGFloat

  var cgPoint: CGPoint { CGPoint(x: x, y: y) }
}

private struct FocusRange {
  let start: Int
  let duration: Int
}

private struct TimeMapDialView: View {
  let entry: TimeMapEntry

  var body: some View {
    GeometryReader { geometry in
      let size = min(324, geometry.size.width, geometry.size.height)
      let origin = CGPoint(
        x: (geometry.size.width - size) / 2,
        y: (geometry.size.height - size) / 2
      )

      Canvas { context, _ in
        drawDial(context: &context, size: size, origin: origin)
      }
    }
    .timeMapWidgetBackground(Color(hex: entry.payload.backgroundColor))
    .widgetURL(URL(string: "ethos://schedule"))
  }

  private func drawDial(context: inout GraphicsContext, size: CGFloat, origin: CGPoint) {
    let center = TimeMapPoint(x: origin.x + size / 2, y: origin.y + size / 2)
    let radius = size / 2 - 29
    let centerContentRadius = min(64, radius - 45)
    let foreground = Color(hex: entry.payload.foregroundColor)
    let background = Color(hex: entry.payload.backgroundColor)
    let muted = Color(hex: entry.payload.mutedColor)

    context.stroke(
      Path(ellipseIn: CGRect(x: center.x - radius, y: center.y - radius, width: radius * 2, height: radius * 2)),
      with: .color(foreground.opacity(entry.payload.isDark ? 0.12 : 0.09)),
      lineWidth: 30
    )

    for box in entry.payload.boxes {
      let start = minutes(box.startTime)
      let duration = max(1, blockDuration(startTime: box.startTime, endTime: box.endTime))
      let color = Color(hex: box.color)
      for range in focusRanges(box: box) {
        context.fill(
          blockPath(start: range.start, duration: range.duration, radius: radius, width: 30, center: center),
          with: .color(color.opacity(box.completed ? 0.48 : 1))
        )
      }

      let arcLength = 2 * CGFloat.pi * radius * CGFloat(duration) / CGFloat(minutesInDay)
      if arcLength >= CGFloat(box.title.count) * 6.5 + 24 {
        drawCurvedText(
          box.title,
          context: &context,
          start: start,
          duration: duration,
          radius: radius - 6,
          center: center,
          color: labelColor(background: box.color).opacity(box.completed ? 0.6 : 1),
          font: .system(size: 11, weight: .bold),
          tracking: 0.2,
          reversedRadiusOffset: 5
        )
      }
    }

    for index in 0..<48 {
      let angle = CGFloat(index) / 48 * 2 * .pi - .pi / 2
      let major = index % 6 == 0
      let outer = radius + 11
      let inner = outer - (major ? 10 : 5)
      var tick = Path()
      tick.move(to: CGPoint(x: center.x + cos(angle) * inner, y: center.y + sin(angle) * inner))
      tick.addLine(to: CGPoint(x: center.x + cos(angle) * outer, y: center.y + sin(angle) * outer))
      context.stroke(tick, with: .color(foreground.opacity(entry.payload.isDark ? 0.34 : 0.25)), style: StrokeStyle(lineWidth: major ? 2 : 1.5, lineCap: .round))
    }

    for range in entry.payload.availableRanges {
      let labelRadius = radius + 21
      let arcLength = 2 * CGFloat.pi * labelRadius * CGFloat(range.duration) / CGFloat(minutesInDay)
      let label = arcLength >= CGFloat(range.fullLabel.count) * 5.5 + 20 ? range.fullLabel : range.compactLabel
      if arcLength >= CGFloat(label.count) * 5.5 + 8 {
        drawCurvedText(
          label,
          context: &context,
          start: range.duration == minutesInDay ? 12 * 60 : range.start,
          duration: min(range.duration, minutesInDay - 1),
          radius: labelRadius,
          center: center,
          color: muted,
          font: .system(size: 9.5, weight: .semibold),
          tracking: 0.3,
          reversedRadiusOffset: 5
        )
      }
    }

    for hour in stride(from: 0, to: 24, by: 2) {
      let point = point(minutes: hour * 60, radius: radius - 33, center: center)
      let major = hour % 6 == 0
      let text = context.resolve(
        Text(String(format: "%02d", hour))
          .font(.system(size: major ? 12 : 11, weight: major ? .bold : .medium))
          .foregroundColor(major ? foreground : foreground.opacity(0.58))
      )
      context.draw(text, at: CGPoint(x: point.x, y: point.y), anchor: .center)
    }

    if isPayloadDateToday {
      let components = Calendar.autoupdatingCurrent.dateComponents([.hour, .minute], from: entry.date)
      let nowMinutes = (components.hour ?? 0) * 60 + (components.minute ?? 0)
      let lineStart = point(minutes: nowMinutes, radius: centerContentRadius, center: center)
      let nowPoint = point(minutes: nowMinutes, radius: radius + 5, center: center)
      let baseStart = point(minutes: nowMinutes - 10, radius: radius + 15, center: center)
      let baseEnd = point(minutes: nowMinutes + 10, radius: radius + 15, center: center)
      var line = Path()
      line.move(to: lineStart.cgPoint)
      line.addLine(to: nowPoint.cgPoint)
      context.stroke(line, with: .color(foreground.opacity(0.3)), style: StrokeStyle(lineWidth: 1.5, dash: [3, 5]))
      var marker = Path()
      marker.move(to: nowPoint.cgPoint)
      marker.addLine(to: baseStart.cgPoint)
      marker.addLine(to: baseEnd.cgPoint)
      marker.closeSubpath()
      context.fill(marker, with: .color(foreground))
      context.stroke(marker, with: .color(foreground), style: StrokeStyle(lineWidth: 3, lineCap: .round, lineJoin: .round))
    }

    context.fill(
      Path(ellipseIn: CGRect(x: center.x - centerContentRadius, y: center.y - centerContentRadius, width: centerContentRadius * 2, height: centerContentRadius * 2)),
      with: .color(background)
    )
    context.stroke(
      Path(ellipseIn: CGRect(x: center.x - centerContentRadius, y: center.y - centerContentRadius, width: centerContentRadius * 2, height: centerContentRadius * 2)),
      with: .color(foreground.opacity(entry.payload.isDark ? 0.2 : 0.14)),
      lineWidth: 1.5
    )

    let duration = context.resolve(
      Text(entry.payload.durationLabel)
        .font(.system(size: 24, weight: .black))
        .foregroundColor(foreground)
    )
    context.draw(duration, at: CGPoint(x: center.x, y: center.y - 8), anchor: .center)
    let mapLabel = context.resolve(
      Text(entry.payload.mapLabel.uppercased())
        .font(.system(size: 12, weight: .semibold))
        .tracking(1.5)
        .foregroundColor(muted)
    )
    context.draw(mapLabel, at: CGPoint(x: center.x, y: center.y + 18), anchor: .center)
  }

  private var isPayloadDateToday: Bool {
    let formatter = DateFormatter()
    formatter.calendar = .autoupdatingCurrent
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.dateFormat = "yyyy-MM-dd"
    return formatter.string(from: entry.date) == entry.payload.date
  }

  private func minutes(_ value: String) -> Int {
    let parts = value.split(separator: ":").compactMap { Int($0) }
    guard parts.count == 2 else { return 0 }
    return parts[0] * 60 + parts[1]
  }

  private func blockDuration(startTime: String, endTime: String) -> Int {
    let start = minutes(startTime)
    let end = minutes(endTime)
    if start == end { return 0 }
    return end > start ? end - start : minutesInDay - start + end
  }

  private func focusRanges(box: TimeMapBlock) -> [FocusRange] {
    let duration = blockDuration(startTime: box.startTime, endTime: box.endTime)
    if box.breakDurations.isEmpty { return [FocusRange(start: minutes(box.startTime), duration: duration)] }
    let focusDuration = max(0, duration - box.breakDurations.reduce(0, +))
    let segmentCount = box.breakDurations.count + 1
    let baseSegment = focusDuration / segmentCount
    let remainder = focusDuration % segmentCount
    let start = minutes(box.startTime)
    var offset = 0
    var ranges: [FocusRange] = []
    for (index, breakDuration) in box.breakDurations.enumerated() {
      let segmentDuration = baseSegment + (index < remainder ? 1 : 0)
      ranges.append(FocusRange(start: (start + offset) % minutesInDay, duration: segmentDuration))
      offset += segmentDuration + breakDuration
    }
    ranges.append(FocusRange(start: (start + offset) % minutesInDay, duration: duration - offset))
    return ranges.filter { $0.duration > 0 }
  }

  private func point(minutes: Int, radius: CGFloat, center: TimeMapPoint) -> TimeMapPoint {
    point(minutes: CGFloat(minutes), radius: radius, center: center)
  }

  private func point(minutes: CGFloat, radius: CGFloat, center: TimeMapPoint) -> TimeMapPoint {
    let angle = minutes / CGFloat(minutesInDay) * 2 * .pi - .pi / 2
    return TimeMapPoint(x: center.x + cos(angle) * radius, y: center.y + sin(angle) * radius)
  }

  private func angle(minutes: CGFloat) -> Angle {
    .radians(Double(minutes / CGFloat(minutesInDay) * 2 * .pi - .pi / 2))
  }

  private func blockPath(start: Int, duration: Int, radius: CGFloat, width: CGFloat, center: TimeMapPoint) -> Path {
    let outerRadius = radius + width / 2
    let innerRadius = radius - width / 2
    let sweep = CGFloat(duration) / CGFloat(minutesInDay) * 2 * .pi
    let cornerRadius = min(4, innerRadius * sweep / 4, width / 2)
    let outerInset = cornerRadius / outerRadius / (2 * .pi) * CGFloat(minutesInDay)
    let innerInset = cornerRadius / innerRadius / (2 * .pi) * CGFloat(minutesInDay)
    let end = CGFloat(start + duration)
    let outerStart = point(minutes: CGFloat(start) + outerInset, radius: outerRadius, center: center)
    let endOuterCorner = point(minutes: end, radius: outerRadius, center: center)
    let endOuterCap = point(minutes: end, radius: outerRadius - cornerRadius, center: center)
    let endInnerCap = point(minutes: end, radius: innerRadius + cornerRadius, center: center)
    let endInnerCorner = point(minutes: end, radius: innerRadius, center: center)
    let innerEnd = point(minutes: end - innerInset, radius: innerRadius, center: center)
    let startInnerCorner = point(minutes: start, radius: innerRadius, center: center)
    let startInnerCap = point(minutes: start, radius: innerRadius + cornerRadius, center: center)
    let startOuterCap = point(minutes: start, radius: outerRadius - cornerRadius, center: center)
    let startOuterCorner = point(minutes: start, radius: outerRadius, center: center)
    var path = Path()
    path.move(to: outerStart.cgPoint)
    path.addArc(center: center.cgPoint, radius: outerRadius, startAngle: angle(minutes: CGFloat(start) + outerInset), endAngle: angle(minutes: end - outerInset), clockwise: false)
    path.addQuadCurve(to: endOuterCap.cgPoint, control: endOuterCorner.cgPoint)
    path.addLine(to: endInnerCap.cgPoint)
    path.addQuadCurve(to: innerEnd.cgPoint, control: endInnerCorner.cgPoint)
    path.addArc(center: center.cgPoint, radius: innerRadius, startAngle: angle(minutes: end - innerInset), endAngle: angle(minutes: CGFloat(start) + innerInset), clockwise: true)
    path.addQuadCurve(to: startInnerCap.cgPoint, control: startInnerCorner.cgPoint)
    path.addLine(to: startOuterCap.cgPoint)
    path.addQuadCurve(to: outerStart.cgPoint, control: startOuterCorner.cgPoint)
    path.closeSubpath()
    return path
  }

  private func drawCurvedText(
    _ value: String,
    context: inout GraphicsContext,
    start: Int,
    duration: Int,
    radius: CGFloat,
    center: TimeMapPoint,
    color: Color,
    font: Font,
    tracking: CGFloat,
    reversedRadiusOffset: CGFloat
  ) {
    let midpoint = (CGFloat(start) + CGFloat(duration) / 2).truncatingRemainder(dividingBy: CGFloat(minutesInDay))
    let reversed = midpoint > 6 * 60 && midpoint < 18 * 60
    let labelRadius = radius + (reversed ? reversedRadiusOffset : 0)
    let glyphs = value.map { character -> (GraphicsContext.ResolvedText, CGFloat) in
      let resolved = context.resolve(Text(String(character)).font(font).foregroundColor(color))
      return (resolved, resolved.measure(in: CGSize(width: 100, height: 100)).width + tracking)
    }
    let totalWidth = glyphs.reduce(CGFloat.zero) { $0 + $1.1 }
    var cursor = -totalWidth / 2
    let centerMinutes = CGFloat(start) + CGFloat(duration) / 2

    for (glyph, width) in glyphs {
      let offset = cursor + width / 2
      let glyphMinutes = centerMinutes + (reversed ? -1 : 1) * offset / labelRadius / (2 * .pi) * CGFloat(minutesInDay)
      let glyphAngle = glyphMinutes / CGFloat(minutesInDay) * 2 * .pi - .pi / 2
      let position = CGPoint(x: center.x + cos(glyphAngle) * labelRadius, y: center.y + sin(glyphAngle) * labelRadius)
      var glyphContext = context
      glyphContext.translateBy(x: position.x, y: position.y)
      glyphContext.rotate(by: .radians(Double(glyphAngle + (reversed ? -.pi / 2 : .pi / 2))))
      glyphContext.draw(glyph, at: .zero, anchor: .center)
      cursor += width
    }
  }

  private func labelColor(background: String) -> Color {
    let hex = background.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
    guard hex.count == 6, let value = Int(hex, radix: 16) else { return .white }
    let red = CGFloat((value >> 16) & 0xff)
    let green = CGFloat((value >> 8) & 0xff)
    let blue = CGFloat(value & 0xff)
    return (red * 299 + green * 587 + blue * 114) / 1000 > 160 ? Color(hex: "#111827") : .white
  }
}

private extension Color {
  init(hex: String) {
    let cleaned = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
    let value = UInt64(cleaned, radix: 16) ?? 0
    let red = Double((value >> 16) & 0xff) / 255
    let green = Double((value >> 8) & 0xff) / 255
    let blue = Double(value & 0xff) / 255
    self.init(red: red, green: green, blue: blue)
  }
}

private extension View {
  @ViewBuilder
  func timeMapWidgetBackground(_ color: Color) -> some View {
    if #available(iOSApplicationExtension 17.0, *) {
      containerBackground(color, for: .widget)
    } else {
      background(color)
    }
  }
}

struct EthosTimeMapWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: timeMapWidgetKind, provider: TimeMapProvider()) { entry in
      TimeMapDialView(entry: entry)
    }
    .configurationDisplayName("Time Map")
    .description("See today's schedule as a 24-hour time map.")
    .supportedFamilies([.systemLarge])
    .contentMarginsDisabled()
  }
}
