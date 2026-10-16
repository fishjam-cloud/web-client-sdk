import FishjamClient
import SwiftUI

@main
struct FishjamExampleApp: App {
    var body: some Scene {
        WindowGroup {
            AddView()
        }
    }
}

struct AddView: View {
    @State private var first = "2"
    @State private var second = "3"
    @State private var result = ""

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text("Fishjam example")
                    .font(.title2)
                TextField("First number", text: $first)
                    .keyboardType(.numbersAndPunctuation)
                    .textFieldStyle(.roundedBorder)
                    .accessibilityIdentifier("first")
                TextField("Second number", text: $second)
                    .keyboardType(.numbersAndPunctuation)
                    .textFieldStyle(.roundedBorder)
                    .accessibilityIdentifier("second")
                Button("Add") {
                    let trimmedFirst = first.trimmingCharacters(in: .whitespaces)
                    let trimmedSecond = second.trimmingCharacters(in: .whitespaces)
                    guard let lhs = Int32(trimmedFirst), let rhs = Int32(trimmedSecond) else {
                        result = "Enter two whole numbers"
                        return
                    }
                    result = "Result: \(FishjamCoreBridge.add(a: lhs, b: rhs))"
                }
                .buttonStyle(.borderedProminent)
                .frame(maxWidth: .infinity)
                .accessibilityIdentifier("add")
                Text(result)
                    .accessibilityIdentifier("result")
            }
            .padding(16)
        }
    }
}
