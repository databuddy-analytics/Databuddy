import Foundation

public struct DatabuddyConfiguration: Equatable {
    public static let defaultAPIURL = URL(string: "https://basket.databuddy.cc")!
    public static let maximumBatchSize = 100

    public var apiURL: URL
    public var clientId: String
    public var enabled: Bool
    public var flushAt: Int
    public var flushInterval: TimeInterval
    public var maxQueueSize: Int
    public var namespace: String?
    public var source: String?

    public init(
        clientId: String,
        apiURL: URL = DatabuddyConfiguration.defaultAPIURL,
        source: String? = DatabuddyConfiguration.defaultSource,
        namespace: String? = nil,
        enabled: Bool = true,
        flushAt: Int = 10,
        flushInterval: TimeInterval = 2.0,
        maxQueueSize: Int = 1_000
    ) {
        self.apiURL = apiURL
        self.clientId = clientId.trimmed
        self.enabled = enabled
        self.flushAt = min(
            max(1, flushAt),
            DatabuddyConfiguration.maximumBatchSize
        )
        self.flushInterval = flushInterval.isFinite ? max(0, flushInterval) : 0
        self.maxQueueSize = max(1, maxQueueSize)
        self.namespace = namespace?.trimmed.nonEmpty
        self.source = source?.trimmed.nonEmpty
    }

    var canSend: Bool {
        enabled && !clientId.isEmpty
    }

    public static var defaultSource: String {
        #if os(iOS)
            return "ios"
        #elseif os(macOS)
            return "macos"
        #elseif os(tvOS)
            return "tvos"
        #elseif os(watchOS)
            return "watchos"
        #else
            return "swift"
        #endif
    }
}

extension String {
    var nonEmpty: String? {
        isEmpty ? nil : self
    }

    var trimmed: String {
        trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
