import SwiftUI
import WidgetKit
internal import ExpoWidgets

private let cashflowWidgetKind = "EthosCashflowStatsWidget"

private struct CashflowPayload: Decodable {
  let walletName: String
  let periodLabel: String
  let balanceLabel: String
  let incomeLabel: String
  let expensesLabel: String
  let quickEntryLabel: String
  let balance: String
  let income: String
  let expenses: String
  let balanceTone: String
  let amountsHidden: Bool
  let emptyMessage: String
  let isEmpty: Bool
  let backgroundColor: String
  let foregroundColor: String
  let mutedColor: String
  let primaryColor: String
  let positiveColor: String
  let negativeColor: String
  let isDark: Bool

  static let placeholder = CashflowPayload(
    walletName: "Ethos",
    periodLabel: "This month",
    balanceLabel: "Balance",
    incomeLabel: "Income",
    expensesLabel: "Expenses",
    quickEntryLabel: "New entry",
    balance: "$2,480",
    income: "$4,200",
    expenses: "$1,720",
    balanceTone: "positive",
    amountsHidden: false,
    emptyMessage: "Open Ethos to load your cashflow",
    isEmpty: false,
    backgroundColor: "#F7FDF9",
    foregroundColor: "#000000",
    mutedColor: "#64748B",
    primaryColor: "#2E3F55",
    positiveColor: "#16845B",
    negativeColor: "#C43D48",
    isDark: false
  )
}

private struct CashflowEntry: TimelineEntry {
  let date: Date
  let payload: CashflowPayload
}

private struct CashflowProvider: TimelineProvider {
  func placeholder(in context: Context) -> CashflowEntry {
    CashflowEntry(date: Date(), payload: .placeholder)
  }

  func getSnapshot(in context: Context, completion: @escaping (CashflowEntry) -> Void) {
    completion(CashflowEntry(date: Date(), payload: loadPayload() ?? .placeholder))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<CashflowEntry>) -> Void) {
    let entry = CashflowEntry(date: Date(), payload: loadPayload() ?? .placeholder)
    completion(Timeline(entries: [entry], policy: .never))
  }

  private func loadPayload() -> CashflowPayload? {
    guard
      let timeline = WidgetsStorage.getArray(forKey: "__expo_widgets_\(cashflowWidgetKind)_timeline") as? [[String: Any]],
      let props = timeline.last?["props"] as? [String: Any],
      let data = try? JSONSerialization.data(withJSONObject: props)
    else {
      return nil
    }
    return try? JSONDecoder().decode(CashflowPayload.self, from: data)
  }
}

private struct CashflowWidgetView: View {
  let entry: CashflowEntry

  private var payload: CashflowPayload { entry.payload }
  private var background: Color { Color(hex: payload.backgroundColor) }
  private var foreground: Color { Color(hex: payload.foregroundColor) }
  private var muted: Color { Color(hex: payload.mutedColor) }
  private var primary: Color { Color(hex: payload.primaryColor) }
  private var positive: Color { Color(hex: payload.positiveColor) }
  private var negative: Color { Color(hex: payload.negativeColor) }
  private var balanceColor: Color {
    if payload.balanceTone == "positive" { return positive }
    if payload.balanceTone == "negative" { return negative }
    return foreground
  }
  private var hiddenAmount: String { "••••••" }

  var body: some View {
    VStack(alignment: .leading, spacing: 13) {
      header
      if payload.isEmpty {
        emptyState
      } else {
        stats
      }
    }
    .padding(.horizontal, 17)
    .padding(.vertical, 15)
    .cashflowWidgetBackground(background)
    .widgetURL(URL(string: "ethos://summary"))
  }

  private var header: some View {
    HStack(alignment: .center, spacing: 10) {
      VStack(alignment: .leading, spacing: 3) {
        Capsule()
          .fill(primary)
          .frame(width: 28, height: 3)
        Text(payload.walletName.isEmpty ? "Ethos" : payload.walletName)
          .font(.system(size: 13, weight: .semibold))
          .foregroundColor(foreground)
          .lineLimit(1)
      }
      Spacer(minLength: 8)
      Link(destination: URL(string: "ethos://forms/entry-form")!) {
        HStack(spacing: 5) {
          Image(systemName: "plus")
            .font(.system(size: 11, weight: .bold))
          Text(payload.quickEntryLabel)
            .font(.system(size: 11, weight: .semibold))
            .lineLimit(1)
        }
        .foregroundColor(background)
        .padding(.horizontal, 10)
        .padding(.vertical, 7)
        .background(primary, in: Capsule())
      }
      .buttonStyle(.plain)
    }
  }

  private var emptyState: some View {
    VStack(alignment: .leading, spacing: 5) {
      Text(payload.periodLabel.uppercased())
        .font(.system(size: 9, weight: .bold))
        .tracking(0.8)
        .foregroundColor(primary)
      Text(payload.emptyMessage)
        .font(.system(size: 15, weight: .medium))
        .foregroundColor(muted)
        .lineLimit(2)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private var stats: some View {
    HStack(alignment: .bottom, spacing: 15) {
      VStack(alignment: .leading, spacing: 4) {
        HStack(spacing: 5) {
          Text(payload.periodLabel.uppercased())
            .font(.system(size: 9, weight: .bold))
            .tracking(0.7)
            .foregroundColor(primary)
          Text("·")
            .font(.system(size: 10, weight: .bold))
            .foregroundColor(muted.opacity(0.65))
          Text(payload.balanceLabel.uppercased())
            .font(.system(size: 9, weight: .semibold))
            .tracking(0.5)
            .foregroundColor(muted)
        }
        Text(payload.amountsHidden ? hiddenAmount : payload.balance)
          .font(.system(size: 27, weight: .bold, design: .rounded))
          .monospacedDigit()
          .foregroundColor(balanceColor)
          .lineLimit(1)
          .minimumScaleFactor(0.55)
          .privacySensitive()
      }
      .frame(maxWidth: .infinity, alignment: .leading)

      Rectangle()
        .fill(foreground.opacity(payload.isDark ? 0.16 : 0.09))
        .frame(width: 1, height: 47)

      VStack(alignment: .leading, spacing: 8) {
        statRow(label: payload.incomeLabel, amount: payload.income, color: positive, symbol: "arrow.down.left")
        statRow(label: payload.expensesLabel, amount: payload.expenses, color: negative, symbol: "arrow.up.right")
      }
      .frame(width: 112, alignment: .leading)
    }
  }

  private func statRow(label: String, amount: String, color: Color, symbol: String) -> some View {
    HStack(spacing: 7) {
      RoundedRectangle(cornerRadius: 2)
        .fill(color)
        .frame(width: 3, height: 23)
      VStack(alignment: .leading, spacing: 0) {
        Text(label.uppercased())
          .font(.system(size: 8, weight: .semibold))
          .tracking(0.5)
          .foregroundColor(muted)
        Text(payload.amountsHidden ? "••••" : amount)
          .font(.system(size: 12, weight: .bold, design: .rounded))
          .monospacedDigit()
          .foregroundColor(foreground)
          .lineLimit(1)
          .minimumScaleFactor(0.65)
          .privacySensitive()
      }
      Spacer(minLength: 0)
      Image(systemName: symbol)
        .font(.system(size: 9, weight: .bold))
        .foregroundColor(color)
    }
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
  func cashflowWidgetBackground(_ color: Color) -> some View {
    if #available(iOSApplicationExtension 17.0, *) {
      containerBackground(color, for: .widget)
    } else {
      background(color)
    }
  }
}

struct EthosCashflowStatsWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: cashflowWidgetKind, provider: CashflowProvider()) { entry in
      CashflowWidgetView(entry: entry)
    }
    .configurationDisplayName("Cashflow Stats")
    .description("See your active wallet's balance, income, and expenses.")
    .supportedFamilies([.systemMedium])
  }
}
