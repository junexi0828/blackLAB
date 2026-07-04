import SwiftUI

struct CaveHistoryView: View {
    @ObservedObject var store: StudySessionStore

    var body: some View {
        ZStack {
            caveBackground

            ScrollView {
                VStack(spacing: 20) {
                    headerBlock
                    statsGrid
                    zenCalendarBlock
                    ledgerBlock
                }
                .padding(20)
            }
        }
    }

    private var caveBackground: some View {
        LinearGradient(
            colors: [CaveTheme.backgroundTop, CaveTheme.backgroundBottom],
            startPoint: .top,
            endPoint: .bottom
        )
        .ignoresSafeArea()
    }

    private var headerBlock: some View {
        HStack(alignment: .center) {
            VStack(alignment: .leading, spacing: 6) {
                Text("수련 장부")
                    .font(.system(size: 32, weight: .black, design: .serif))
                    .foregroundStyle(.white)
                Text("지금껏 걸어온 정진의 흔적입니다.")
                    .font(.system(size: 14, weight: .medium, design: .serif))
                    .foregroundStyle(.white.opacity(0.64))
            }
            Spacer()
            
            Image("BambooSpirit")
                .resizable()
                .aspectRatio(contentMode: .fill)
                .frame(width: 64, height: 64)
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .stroke(CaveTheme.gold.opacity(0.25), lineWidth: 1)
                )
                .shadow(color: .black.opacity(0.3), radius: 6)
        }
        .padding(.vertical, 10)
    }

    private var statsGrid: some View {
        VStack(spacing: 12) {
            HStack(spacing: 12) {
                statCard(title: "총 수련 회차", value: "\(store.totalSessionsCount)회", icon: "pencil.and.outline", accent: CaveTheme.gold)
                statCard(title: "연속 수련일", value: "\(store.streakDays)일", icon: "flame.fill", accent: CaveTheme.ember)
            }
            
            HStack(spacing: 12) {
                statCard(title: "평균 수련 시간", value: store.averageSessionDurationText, icon: "hourglass", accent: CaveTheme.jade)
                statCard(title: "수련 등급", value: store.userTierKoreanOnly, icon: "laurel.leading", accent: CaveTheme.gold)
            }
        }
    }

    private func statCard(title: String, value: String, icon: String, accent: Color) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: icon)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(accent)
                Spacer()
            }
            
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.system(size: 13, weight: .semibold, design: .serif))
                    .foregroundStyle(.white.opacity(0.55))
                Text(value)
                    .font(.system(size: 18, weight: .bold, design: .serif))
                    .foregroundStyle(.white)
                    .minimumScaleFactor(0.7)
                    .lineLimit(1)
            }
        }
        .padding(16)
        .background(stonePanel)
    }

    private var ledgerBlock: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text("수련 일지")
                    .font(.system(size: 18, weight: .bold, design: .serif))
                    .foregroundStyle(CaveTheme.gold)
                Spacer()
                Text("총 \(store.sessionLog.count)개 기록")
                    .font(.system(size: 13, weight: .semibold, design: .serif))
                    .foregroundStyle(.white.opacity(0.5))
            }
            .padding(.horizontal, 4)

            if store.sessionLog.isEmpty {
                VStack(spacing: 12) {
                    Image(systemName: "tray")
                        .font(.system(size: 32))
                        .foregroundStyle(.white.opacity(0.2))
                    Text("장부가 비어 있습니다. 첫 입관을 마쳐 흔적을 남기십시오.")
                        .font(.system(size: 14, weight: .medium, design: .serif))
                        .foregroundStyle(.white.opacity(0.4))
                        .multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 60)
                .background(stonePanel)
            } else {
                VStack(spacing: 12) {
                    ForEach(store.sessionLog) { entry in
                        HStack(spacing: 16) {
                            Circle()
                                .fill(CaveTheme.gold.opacity(0.6))
                                .frame(width: 8, height: 8)
                            
                            VStack(alignment: .leading, spacing: 4) {
                                Text(Self.logDateFormatter.string(from: entry.date))
                                    .font(.system(size: 15, weight: .semibold, design: .serif))
                                    .foregroundStyle(.white)
                                Text(Self.logTimeFormatter.string(from: entry.date))
                                    .font(.system(size: 12))
                                    .foregroundStyle(.white.opacity(0.45))
                            }
                            
                            Spacer()
                            
                            HStack(spacing: 12) {
                                Text(CaveTimeFormatter.format(seconds: entry.duration))
                                    .font(.system(size: 16, weight: .bold, design: .rounded))
                                    .monospacedDigit()
                                    .foregroundStyle(CaveTheme.jade)
                                
                                Button {
                                    withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                                        store.deleteEntry(id: entry.id)
                                    }
                                } label: {
                                    Image(systemName: "trash.fill")
                                        .font(.system(size: 12))
                                        .foregroundStyle(.red.opacity(0.7))
                                        .padding(8)
                                        .background(Color.red.opacity(0.1))
                                        .clipShape(Circle())
                                }
                                .accessibilityIdentifier("deleteEntryButton_\(entry.id.uuidString)")
                            }
                        }
                        .padding(.vertical, 12)
                        .padding(.horizontal, 16)
                        .background(
                            RoundedRectangle(cornerRadius: 18, style: .continuous)
                                .fill(Color.white.opacity(0.02))
                        )
                    }
                }
                .padding(8)
                .background(stonePanel)
            }
        }
    }

    private var stonePanel: some View {
        RoundedRectangle(cornerRadius: 24, style: .continuous)
            .fill(
                LinearGradient(
                    colors: [CaveTheme.panel.opacity(0.85), CaveTheme.panelSoft.opacity(0.92)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .overlay(
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .strokeBorder(.white.opacity(0.05), lineWidth: 1)
            )
            .shadow(color: .black.opacity(0.2), radius: 12, x: 0, y: 8)
    }

    private static let logDateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy년 MM월 dd일"
        return formatter
    }()

    private static let logTimeFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm:ss에 기록됨"
        return formatter
    }()
    
    // MARK: - Zen Calligraphy Calendar Helpers
    
    private var currentMonthYearText: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy년 M월 정진표"
        return formatter.string(from: Date())
    }
    
    private var daysInCurrentMonth: [Date?] {
        let calendar = Calendar.current
        let now = Date()
        guard let monthRange = calendar.range(of: .day, in: .month, for: now) else { return [] }
        
        let components = calendar.dateComponents([.year, .month], from: now)
        guard let firstOfMonth = calendar.date(from: components) else { return [] }
        
        let weekday = calendar.component(.weekday, from: firstOfMonth) // 1=일요일, ..., 7=토요일
        
        var days: [Date?] = Array(repeating: nil, count: weekday - 1)
        
        for day in 1...monthRange.count {
            if let date = calendar.date(byAdding: .day, value: day - 1, to: firstOfMonth) {
                days.append(date)
            }
        }
        
        return days
    }
    
    private func totalDurationForDate(_ date: Date) -> TimeInterval {
        let calendar = Calendar.current
        let entries = store.sessionLog.filter {
            calendar.isDate($0.date, inSameDayAs: date)
        }
        return entries.reduce(0.0) { $0 + $1.duration }
    }
    
    private func calendarCellColor(duration: TimeInterval, isToday: Bool) -> Color {
        guard duration > 0 else {
            return isToday ? Color.white.opacity(0.12) : Color.white.opacity(0.04)
        }
        
        // 공부 시간량에 따라 황금빛(Gold) 농도 진화형으로 표현
        if duration < 300 { // 5분 미만 (짧은 정진)
            return CaveTheme.gold.opacity(0.25)
        } else if duration < 1800 { // 30분 미만
            return CaveTheme.gold.opacity(0.55)
        } else if duration < 3600 { // 1시간 미만
            return CaveTheme.gold.opacity(0.85)
        } else { // 1시간 이상 (깊은 입관수련 도달)
            return CaveTheme.ember.opacity(0.9)
        }
    }
    
    private func formatCompactDuration(_ seconds: TimeInterval) -> String {
        let mins = Int(seconds) / 60
        if mins >= 60 {
            let hrs = mins / 60
            let remMins = mins % 60
            if remMins > 0 {
                return "\(hrs)h\(remMins)m"
            }
            return "\(hrs)h"
        }
        return "\(mins)m"
    }
    
    private var zenCalendarBlock: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("정진 일력 (精進日曆)")
                    .font(.system(size: 18, weight: .bold, design: .serif))
                    .foregroundStyle(CaveTheme.gold)
                Spacer()
                Text(currentMonthYearText)
                    .font(.system(size: 13, weight: .semibold, design: .serif))
                    .foregroundStyle(.white.opacity(0.6))
            }
            
            // 요일 표시선
            let weekdays = ["일", "월", "화", "수", "목", "금", "토"]
            HStack(spacing: 0) {
                ForEach(weekdays, id: \.self) { day in
                    Text(day)
                        .font(.system(size: 11, weight: .bold, design: .serif))
                        .foregroundStyle(.white.opacity(0.3))
                        .frame(maxWidth: .infinity)
                }
            }
            .padding(.bottom, 4)
            
            // 날짜 그리드
            let columns = Array(repeating: GridItem(.flexible(), spacing: 6), count: 7)
            LazyVGrid(columns: columns, spacing: 6) {
                ForEach(0..<daysInCurrentMonth.count, id: \.self) { index in
                    if let date = daysInCurrentMonth[index] {
                        let duration = totalDurationForDate(date)
                        let isToday = Calendar.current.isDateInToday(date)
                        
                        VStack(spacing: 2) {
                            Text("\(Calendar.current.component(.day, from: date))")
                                .font(.system(size: 11, weight: .black, design: .serif))
                                .foregroundStyle(duration > 0 ? Color.black : (isToday ? CaveTheme.gold : .white.opacity(0.6)))
                            
                            if duration > 0 {
                                Text(formatCompactDuration(duration))
                                    .font(.system(size: 7, weight: .black, design: .rounded))
                                    .foregroundStyle(Color.black.opacity(0.8))
                            }
                        }
                        .frame(height: 38)
                        .frame(maxWidth: .infinity)
                        .background(
                            RoundedRectangle(cornerRadius: 8, style: .continuous)
                                .fill(calendarCellColor(duration: duration, isToday: isToday))
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: 8, style: .continuous)
                                .strokeBorder(isToday ? CaveTheme.gold.opacity(0.6) : Color.clear, lineWidth: 1.5)
                        )
                    } else {
                        Color.clear
                            .frame(height: 38)
                    }
                }
            }
        }
        .padding(20)
        .background(stonePanel)
    }
}
