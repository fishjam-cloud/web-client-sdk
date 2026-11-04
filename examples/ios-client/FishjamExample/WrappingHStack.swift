import SwiftUI

struct WrappingHStack: View {
    let spacing: CGFloat
    let views: [AnyView]

    @State private var maxWidth: CGFloat = 0
    @State private var sizes: [Int: CGSize] = [:]

    var body: some View {
        let frames = currentFrames
        framed(buttonStack(frames: frames), height: frames.map(\.maxY).max())
            .background(widthProbe)
            .onPreferenceChange(WidthKey.self, perform: updateWidth)
            .onPreferenceChange(ViewSizeKey.self, perform: updateSizes)
    }

    private func buttonStack(frames: [CGRect]) -> some View {
        ZStack(alignment: .topLeading) {
            ForEach(Array(views.indices), id: \.self) { index in
                HStack(spacing: 0) {
                    views[index]
                }
                .fixedSize()
                .background(sizeProbe(index: index))
                .offset(originOffset(frames: frames, index: index))
            }
        }
        .accessibilityElement(children: .contain)
        .opacity(frames.isEmpty ? 0 : 1)
    }

    @ViewBuilder
    private func framed<Content: View>(_ content: Content, height: CGFloat?) -> some View {
        if let height = height {
            content.frame(
                maxWidth: .infinity,
                minHeight: height,
                maxHeight: height,
                alignment: .topLeading
            )
        } else {
            content.frame(maxWidth: .infinity, alignment: .topLeading)
        }
    }

    private var currentFrames: [CGRect] {
        guard isReady else {
            return []
        }
        return wrappingFrames(
            sizes: sizes,
            count: views.count,
            maxWidth: maxWidth,
            spacing: spacing
        )
    }

    private var isReady: Bool {
        guard maxWidth > 0, sizes.count == views.count else {
            return false
        }
        return sizes.values.allSatisfy { size in
            size.width > 0 && size.height > 0
        }
    }

    private func originOffset(frames: [CGRect], index: Int) -> CGSize {
        guard frames.indices.contains(index) else {
            return .zero
        }
        return CGSize(width: frames[index].minX, height: frames[index].minY)
    }

    private func sizeProbe(index: Int) -> some View {
        GeometryReader { proxy in
            let size = CGSize(
                width: proxy.size.width.rounded(),
                height: proxy.size.height.rounded()
            )
            Color.clear.preference(key: ViewSizeKey.self, value: [index: size])
        }
    }

    private var widthProbe: some View {
        GeometryReader { proxy in
            Color.clear.preference(key: WidthKey.self, value: proxy.size.width.rounded())
        }
    }

    private func updateWidth(_ width: CGFloat) {
        let rounded = width.rounded()
        guard rounded != maxWidth else {
            return
        }
        maxWidth = rounded
    }

    private func updateSizes(_ next: [Int: CGSize]) {
        guard next != sizes else {
            return
        }
        sizes = next
    }

    private func wrappingFrames(
        sizes: [Int: CGSize],
        count: Int,
        maxWidth: CGFloat,
        spacing: CGFloat
    ) -> [CGRect] {
        var frames: [CGRect] = []
        var originX: CGFloat = 0
        var originY: CGFloat = 0
        var rowHeight: CGFloat = 0
        for index in 0..<count {
            let size = sizes[index] ?? .zero
            let wraps = originX > 0 && originX + size.width > maxWidth
            if wraps {
                originX = 0
                originY += rowHeight + spacing
                rowHeight = 0
            }
            let origin = CGPoint(x: originX, y: originY)
            frames.append(CGRect(origin: origin, size: size))
            originX += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
        return frames
    }
}

private struct WidthKey: PreferenceKey {
    static var defaultValue: CGFloat = 0

    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = max(value, nextValue())
    }
}

private struct ViewSizeKey: PreferenceKey {
    static var defaultValue: [Int: CGSize] = [:]

    static func reduce(value: inout [Int: CGSize], nextValue: () -> [Int: CGSize]) {
        value.merge(nextValue(), uniquingKeysWith: { _, new in new })
    }
}
