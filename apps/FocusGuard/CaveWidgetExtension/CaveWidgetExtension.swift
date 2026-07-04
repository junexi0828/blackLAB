import WidgetKit
import ActivityKit
import SwiftUI

struct CaveWidgetEntry: TimelineEntry {
    let date: Date
    let snapshot: SharedCaveSnapshot
}

struct CaveWidgetProvider: TimelineProvider {
    func placeholder(in context: Context) -> CaveWidgetEntry {
        CaveWidgetEntry(date: .now, snapshot: .empty)
    }

    func getSnapshot(in context: Context, completion: @escaping (CaveWidgetEntry) -> Void) {
        completion(CaveWidgetEntry(date: .now, snapshot: SharedCaveStore.load()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<CaveWidgetEntry>) -> Void) {
        let snapshot = SharedCaveStore.load()
        let entry = CaveWidgetEntry(date: .now, snapshot: snapshot)
        completion(Timeline(entries: [entry], policy: .after(Date().addingTimeInterval(60))))
    }
}

struct CaveWidgetView: View {
    var entry: CaveWidgetProvider.Entry
    @Environment(\.widgetFamily) var widgetFamily

    var body: some View {
        GeometryReader { proxy in
            let family = WidgetFamilyContext(size: proxy.size)

            ZStack {
                caveTexture(size: proxy.size)
                sealMark(size: proxy.size)
                tigerGuard(size: proxy.size)
                waterDrips(size: proxy.size)

                content(size: proxy.size, family: family)
            }
            .containerBackground(for: .widget) {
                caveBackdrop(size: proxy.size)
            }
        }
    }

    private static func format(seconds: TimeInterval) -> String {
        CaveTimeFormatter.format(seconds: seconds)
    }

    private func caveBackdrop(size: CGSize) -> some View {
        LinearGradient(
            colors: [
                CaveTheme.backgroundTop,
                Color(red: 0.06, green: 0.06, blue: 0.07),
                CaveTheme.backgroundBottom
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        .overlay {
            // 정숙하고 깊이감 있는 수묵 농담 효과로 격조 높은 배경 대체
            RadialGradient(
                colors: [Color.black.opacity(0.3), .clear],
                center: .center,
                startRadius: 10,
                endRadius: max(size.width, size.height) * 0.5
            )
            .blendMode(.multiply)
        }
        .overlay {
            RadialGradient(
                colors: [
                    CaveTheme.gold.opacity(entry.snapshot.isRunning ? 0.24 : 0.14),
                    .clear
                ],
                center: .topLeading,
                startRadius: 20,
                endRadius: max(size.width, size.height) * 0.9
            )
            .blendMode(.screen)
        }
    }

    private func caveTexture(size: CGSize) -> some View {
        ZStack {
            RoundedRectangle(cornerRadius: min(size.width, size.height) * 0.18, style: .continuous)
                .fill(Color.white.opacity(0.02))
                .blur(radius: 0.5)
                .offset(x: 12, y: 10)

            RoundedRectangle(cornerRadius: min(size.width, size.height) * 0.16, style: .continuous)
                .strokeBorder(
                    LinearGradient(
                        colors: [CaveTheme.gold.opacity(0.45), .clear, CaveTheme.stone.opacity(0.55)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ),
                    lineWidth: 1
                )
                .blendMode(.overlay)
        }
        .padding(size.width * 0.06)
        .opacity(0.9)
    }

    private func sealMark(size: CGSize) -> some View {
        let sealSize = min(size.width, size.height) * 0.24
        return VStack {
            HStack {
                Spacer()
                ZStack {
                    RoundedRectangle(cornerRadius: sealSize * 0.18, style: .continuous)
                        .fill(CaveTheme.ember.opacity(0.82))
                        .overlay(
                            RoundedRectangle(cornerRadius: sealSize * 0.18, style: .continuous)
                                .strokeBorder(CaveTheme.gold.opacity(0.52), lineWidth: 1)
                        )
                    VStack(spacing: 2) {
                        Text("封")
                            .font(.system(size: sealSize * 0.34, weight: .black, design: .serif))
                        Text("관")
                            .font(.system(size: sealSize * 0.15, weight: .bold, design: .serif))
                    }
                    .foregroundStyle(.black.opacity(0.88))
                }
                .frame(width: sealSize, height: sealSize)
                .rotationEffect(.degrees(-8))
                .shadow(color: .black.opacity(0.22), radius: 6, x: 0, y: 3)
            }
            Spacer()
        }
        .padding([.top, .trailing], size.width * 0.08)
        .opacity(entry.snapshot.totalStudySeconds > 0 ? 0.96 : 0.72)
    }

    private func tigerGuard(size: CGSize) -> some View {
        let width = size.width * 0.38
        let height = size.height * 0.20
        let breath = 1 + CGFloat(sinePhase(seed: 0.62)) * 0.03

        return VStack {
            Spacer()
            HStack {
                ZStack {
                    RoundedRectangle(cornerRadius: height * 0.45, style: .continuous)
                        .fill(
                            LinearGradient(
                                colors: [
                                    Color(red: 0.50, green: 0.35, blue: 0.18).opacity(0.9),
                                    Color(red: 0.24, green: 0.18, blue: 0.12).opacity(0.95)
                                ],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                    RoundedRectangle(cornerRadius: height * 0.45, style: .continuous)
                        .strokeBorder(CaveTheme.gold.opacity(0.22), lineWidth: 1)
                    HStack(spacing: 8) {
                        Text("虎")
                            .font(.system(size: width * 0.24, weight: .black, design: .serif))
                            .foregroundStyle(CaveTheme.gold.opacity(0.9))
                        VStack(alignment: .leading, spacing: 2) {
                            Text("수호")
                                .font(.system(size: 11, weight: .bold, design: .serif))
                            Text("정진")
                                .font(.system(size: 11, weight: .semibold, design: .serif))
                        }
                        .foregroundStyle(.white.opacity(0.78))
                    }
                }
                .frame(width: width, height: height)
                .scaleEffect(breath)
                .offset(x: -4, y: 2)
                .shadow(color: .black.opacity(0.18), radius: 6, x: 0, y: 3)

                Spacer()
            }
        }
        .padding(.leading, size.width * 0.08)
        .padding(.bottom, size.height * 0.08)
        .opacity(0.88)
    }

    private func waterDrips(size: CGSize) -> some View {
        let phase = sinePhase(seed: entry.snapshot.lastUpdatedAt.timeIntervalSinceReferenceDate)
        let dropX = size.width * (0.22 + 0.16 * (phase + 1) * 0.5)
        let dropY = size.height * (0.14 + 0.08 * (1 - phase))

        return ZStack {
            dripLine(x: size.width * 0.17, size: size, phase: phase, delay: 0)
            dripLine(x: size.width * 0.52, size: size, phase: phase, delay: 0.27)
            dripLine(x: size.width * 0.79, size: size, phase: phase, delay: 0.53)

            Circle()
                .fill(CaveTheme.jade.opacity(0.8))
                .frame(width: 5, height: 5)
                .shadow(color: CaveTheme.jade.opacity(0.5), radius: 6)
                .offset(x: dropX - size.width / 2, y: dropY - size.height / 2)
                .opacity(entry.snapshot.isRunning ? 1 : 0.7)
        }
    }

    private func dripLine(x: CGFloat, size: CGSize, phase: Double, delay: Double) -> some View {
        let scale = 0.5 + 0.5 * sinePhase(seed: phase + delay)
        let length = size.height * (0.10 + 0.08 * scale)
        let opacity = 0.3 + 0.55 * scale

        return Capsule()
            .fill(
                LinearGradient(
                    colors: [CaveTheme.jade.opacity(opacity), .clear],
                    startPoint: .top,
                    endPoint: .bottom
                )
            )
            .frame(width: 2, height: length)
            .offset(x: x - size.width / 2, y: -size.height / 2 + length * 0.5 + 8)
            .blur(radius: 0.15)
    }

    private func content(size: CGSize, family: WidgetFamilyContext) -> some View {
        VStack(alignment: .leading, spacing: family.spacing) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 3) {
                    Text("폐관수련")
                        .font(.system(size: family.titleSize, weight: .semibold, design: .serif))
                        .foregroundStyle(CaveTheme.gold.opacity(0.95))
                    Text(entry.snapshot.isRunning ? "수련이 계속 축적되고 있다" : "기록이 동굴에 머물고 있다")
                        .font(.system(size: family.captionSize, weight: .medium, design: .serif))
                        .foregroundStyle(.white.opacity(0.72))
                }
                Spacer(minLength: 0)
                statusPill(size: family)
            }

            Spacer(minLength: 0)

            VStack(alignment: .leading, spacing: 4) {
                Text(Self.format(seconds: entry.snapshot.totalStudySeconds))
                    .font(.system(size: family.totalSize, weight: .black, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                Text("총 폐관수련")
                    .font(.system(size: family.subheadSize, weight: .semibold, design: .serif))
                    .foregroundStyle(CaveTheme.gold.opacity(0.82))
            }

            if widgetFamily == .systemMedium || widgetFamily == .systemLarge {
                HStack(spacing: family.metricGap) {
                    metricLabel(title: "오늘", value: Self.format(seconds: entry.snapshot.todayStudySeconds), family: family, accent: CaveTheme.ember)
                    metricLabel(
                        title: "회차",
                        value: Self.format(seconds: entry.snapshot.currentSessionSeconds),
                        family: family,
                        accent: CaveTheme.jade,
                        tickingFrom: entry.snapshot.isRunning ? entry.snapshot.sessionStartedAt : nil
                    )
                }
            }
        }
        .padding(family.padding)
    }

    private func statusPill(size: WidgetFamilyContext) -> some View {
        HStack(spacing: 6) {
            Circle()
                .fill(entry.snapshot.isRunning ? CaveTheme.ember : CaveTheme.stone)
                .frame(width: 7, height: 7)
            Text(entry.snapshot.isRunning ? "수련 중" : "대기 중")
                .font(.system(size: size.captionSize, weight: .bold, design: .serif))
        }
        .foregroundStyle(.white.opacity(0.84))
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(
            Capsule()
                .fill(Color.white.opacity(0.06))
                .overlay(
                    Capsule()
                        .strokeBorder(CaveTheme.gold.opacity(0.18), lineWidth: 1)
                )
        )
    }

    private func metricLabel(title: String, value: String, family: WidgetFamilyContext, accent: Color, tickingFrom: Date? = nil) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.system(size: family.metricTitleSize, weight: .semibold, design: .serif))
                .foregroundStyle(accent.opacity(0.95))
            
            if let tickingFrom = tickingFrom {
                Text(tickingFrom, style: .timer)
                    .font(.system(size: family.metricValueSize, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(.white.opacity(0.9))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            } else {
                Text(value)
                    .font(.system(size: family.metricValueSize, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(.white.opacity(0.9))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, family.metricVerticalPadding)
        .padding(.horizontal, family.metricHorizontalPadding)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Color.white.opacity(0.05))
                .overlay(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .strokeBorder(CaveTheme.gold.opacity(0.12), lineWidth: 1)
                )
        )
    }

    private func sinePhase(seed: Double) -> Double {
        sin((entry.date.timeIntervalSinceReferenceDate + seed * 37.0) * 1.15)
    }

    private struct WidgetFamilyContext {
        let padding: CGFloat
        let spacing: CGFloat
        let totalSize: CGFloat
        let titleSize: CGFloat
        let captionSize: CGFloat
        let subheadSize: CGFloat
        let metricTitleSize: CGFloat
        let metricValueSize: CGFloat
        let metricGap: CGFloat
        let metricVerticalPadding: CGFloat
        let metricHorizontalPadding: CGFloat

        init(size: CGSize) {
            let minSide = min(size.width, size.height)

            if minSide < 170 {
                padding = 12
                spacing = 8
                totalSize = 22
                titleSize = 13
                captionSize = 10
                subheadSize = 11
                metricTitleSize = 10
                metricValueSize = 14
                metricGap = 8
                metricVerticalPadding = 8
                metricHorizontalPadding = 10
            } else if minSide < 260 {
                padding = 14
                spacing = 10
                totalSize = 28
                titleSize = 14
                captionSize = 11
                subheadSize = 12
                metricTitleSize = 11
                metricValueSize = 16
                metricGap = 10
                metricVerticalPadding = 9
                metricHorizontalPadding = 11
            } else {
                padding = 18
                spacing = 12
                totalSize = 36
                titleSize = 16
                captionSize = 12
                subheadSize = 13
                metricTitleSize = 12
                metricValueSize = 18
                metricGap = 12
                metricVerticalPadding = 10
                metricHorizontalPadding = 12
            }
        }
    }
}

struct CaveWidget: Widget {
    let kind = "CaveWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: CaveWidgetProvider()) { entry in
            CaveWidgetView(entry: entry)
        }
        .configurationDisplayName("폐관수련")
        .description("총 누적 수련 시간을 크게 보여줍니다.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .accessoryInline, .accessoryRectangular])
    }
}

struct CaveLiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: FocusStudyAttributes.self) { context in
            CaveLiveActivityLockScreenView(context: context)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Text("龍")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(CaveTheme.gold)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(context.state.isRunning ? "수련 중" : "중지")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.white.opacity(0.85))
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(timerInterval: context.state.sessionStartedAt...Date.distantFuture, countsDown: false)
                        .font(.headline.weight(.bold))
                        .monospacedDigit()
                        .foregroundStyle(.white)
                }
            } compactLeading: {
                Text("修")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(CaveTheme.gold)
            } compactTrailing: {
                Text(timerInterval: context.state.sessionStartedAt...Date.distantFuture, countsDown: false)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.white)
            } minimal: {
                Circle()
                    .fill(CaveTheme.gold)
            }
        }
    }
}

struct CaveLiveActivityLockScreenView: View {
    let context: ActivityViewContext<FocusStudyAttributes>

    var body: some View {
        VStack(spacing: 12) {
            // 1. 헤더: 무협 서예풍 타이틀
            HStack(alignment: .center) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("폐관수련 (閉關修練)")
                        .font(.system(size: 11, weight: .black, design: .serif))
                        .foregroundStyle(CaveTheme.gold)
                    Text("정신을 벼려 일념통천(一念通天)의 경지에 들라")
                        .font(.system(size: 9, weight: .bold, design: .serif))
                        .foregroundStyle(.white.opacity(0.4))
                }
                Spacer()
                // 정진 상태 한자 낙인 배지 (精進 / 靜止)
                HStack(spacing: 5) {
                    Circle()
                        .fill(context.state.isRunning ? CaveTheme.ember : CaveTheme.stone)
                        .frame(width: 6, height: 6)
                    
                    Text(context.state.isRunning ? "精進" : (context.state.isPaused ? "靜止" : "閉關"))
                        .font(.system(size: 14, weight: .black, design: .serif))
                        .foregroundStyle(context.state.isRunning ? CaveTheme.gold : (context.state.isPaused ? CaveTheme.ember.opacity(0.8) : .white.opacity(0.35)))
                        .tracking(1)
                }
            }
            
            // 2. 중앙 컨텐츠: 동양 서예 낙관(좌) + 타이머 및 사자성어 격언(우)
            HStack(spacing: 16) {
                // 좌측: 동양 서예 낙관 인장 뷰 (이미지 로딩과 무관하게 100% 정상 작동하며 고풍스러움을 극대화)
                ZStack {
                    Circle()
                        .fill(
                            LinearGradient(
                                colors: [Color(red: 0.55, green: 0.12, blue: 0.12), Color(red: 0.35, green: 0.08, blue: 0.08)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .frame(width: 48, height: 48)
                        .overlay(
                            Circle()
                                .strokeBorder(CaveTheme.gold, lineWidth: 1.5)
                        )
                        .shadow(color: Color.black.opacity(0.4), radius: 4, y: 2)
                    
                    // 낙관 서체 표시 (예: 白虎 / 靑龍 / 鳳凰 / 竹林 / 神仙 / 蓮花)
                    Text(beastHanjaCalligraphy(for: context.state.currentBeastImageName))
                        .font(.system(size: 14, weight: .black, design: .serif))
                        .foregroundStyle(CaveTheme.gold)
                        .tracking(1)
                }
                .id(context.state.currentBeastImageName)
                .transition(.opacity.combined(with: .scale(scale: 0.95)))
                .animation(.easeInOut(duration: 0.65), value: context.state.currentBeastImageName)
                
                // 우측: 타이머 정보 및 수련 격언
                VStack(alignment: .leading, spacing: 3) {
                    Text(beastShortName(for: context.state.currentBeastImageName))
                        .font(.system(size: 12, weight: .bold, design: .serif))
                        .foregroundStyle(.white.opacity(0.95))
                    
                    // 공부 몰입을 돕는 정숙한 사자성어 훈계 노출 (15초 단위 전환)
                    // 줄 넘김(2줄) 및 자동 글자 크기 축소 패치를 엮어 말줄임(...) 잘림 원천 해결
                    Text(makeTraditionalMantra(seconds: context.state.currentSessionSeconds))
                        .font(.system(size: 9.5, weight: .semibold, design: .serif))
                        .foregroundStyle(CaveTheme.gold.opacity(0.85))
                        .lineLimit(2)
                        .minimumScaleFactor(0.75)
                        .multilineTextAlignment(.leading)
                }
                
                Spacer()
                
                // 극대화 타이머
                VStack(alignment: .trailing, spacing: 1) {
                    if context.state.isRunning {
                        Text(timerInterval: context.state.sessionStartedAt...Date.distantFuture, countsDown: false)
                            .font(.system(size: 34, weight: .black, design: .rounded))
                            .monospacedDigit()
                            .foregroundStyle(.white)
                            .shadow(color: CaveTheme.gold.opacity(0.55), radius: 8)
                            .lineLimit(1)
                    } else {
                        Text(CaveTimeFormatter.format(seconds: context.state.currentSessionSeconds))
                            .font(.system(size: 34, weight: .black, design: .rounded))
                            .monospacedDigit()
                            .foregroundStyle(.white)
                            .shadow(color: CaveTheme.gold.opacity(0.55), radius: 8)
                            .lineLimit(1)
                    }
                    Text("수련 시간")
                        .font(.system(size: 9, weight: .bold, design: .serif))
                        .foregroundStyle(CaveTheme.gold.opacity(0.8))
                }
            }
            
            // 3. 하단: 품격 있는 황금색 실선 정진 바 (몰입을 방해하지 않는 깔끔한 라인)
            VStack(spacing: 4) {
                ZStack(alignment: .leading) {
                    Capsule()
                        .fill(Color.white.opacity(0.06))
                        .frame(height: 3)
                    
                    let cycleSeconds: Double = context.state.progressCycleType == "1식경 (30분)" ? 1800.0 : 900.0
                    let progress = min(max(context.state.currentSessionSeconds.truncatingRemainder(dividingBy: cycleSeconds) / cycleSeconds, 0.0), 1.0)
                    
                    Capsule()
                        .fill(
                            LinearGradient(colors: [CaveTheme.gold.opacity(0.4), CaveTheme.gold], startPoint: .leading, endPoint: .trailing)
                        )
                        .frame(width: max(8, 290 * progress), height: 3)
                        .shadow(color: CaveTheme.gold.opacity(0.5), radius: 2)
                }
                
                HStack {
                    Text("오늘 누적 수련: \(CaveTimeFormatter.format(seconds: context.state.todayStudySeconds))")
                        .font(.system(size: 9, weight: .semibold, design: .serif))
                        .foregroundStyle(.white.opacity(0.4))
                    Spacer()
                    Text("총 수련: \(CaveTimeFormatter.format(seconds: context.state.totalStudySeconds))")
                        .font(.system(size: 9, weight: .semibold, design: .serif))
                        .foregroundStyle(CaveTheme.gold.opacity(0.6))
                }
            }
            .padding(.top, 4)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 16)
    }
    
    private func beastShortName(for imageName: String) -> String {
        switch imageName {
        case "TigerSpirit": return "백호의 호위 (白虎)"
        case "DragonFocus": return "청룡의 정진 (靑龍)"
        case "PhoenixFocus": return "봉황의 정련 (鳳凰)"
        case "BambooSpirit": return "죽림의 지조 (竹林)"
        case "CaveHermit": return "신선의 묵상 (神仙)"
        case "LotusZen": return "연화의 평정 (蓮花)"
        default: return "수호 야수"
        }
    }
    
    private func beastHanjaCalligraphy(for imageName: String) -> String {
        switch imageName {
        case "TigerSpirit":  return "白\n虎"
        case "DragonFocus":  return "靑\n龍"
        case "PhoenixFocus": return "鳳\n凰"
        case "BambooSpirit": return "竹\n林"
        case "CaveHermit":   return "神\n仙"
        case "LotusZen":     return "蓮\n화" // '화' 혹은 '花'로 동양적 어휘 조화
        default:             return "修\n練"
        }
    }
    
    private func makeTraditionalMantra(seconds: Double) -> String {
        let mantras = [
            "有志竟成 (유지경성)\n뜻이 있으면 마침내 이룬다",
            "磨斧作針 (마부작침)\n도끼를 갈아서 바늘을 만든다",
            "水滴穿石 (수적천석)\n끊임없는 물방울이 돌을 뚫는다",
            "愚公移山 (우공이산)\n우공이 산을 옮기듯 정진하라",
            "一念通天 (일념통천)\n마음을 모으면 하늘도 통한다",
            "日新又日新 (일신우일신)\n매일매일 새롭게 정진하라"
        ]
        let idx = (Int(seconds) / 15) % mantras.count
        return mantras[idx]
    }
}


@main
struct CaveWidgetBundle: WidgetBundle {
    var body: some Widget {
        CaveWidget()
        CaveLiveActivityWidget()
    }
}
