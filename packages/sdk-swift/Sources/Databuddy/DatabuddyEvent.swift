import Foundation

struct DatabuddyEvent: Encodable, Equatable {
    let anonymousId: String
    let name: String
    let namespace: String?
    let properties: [String: DatabuddyPropertyValue]?
    let sessionId: String
    let source: String?
    let timestamp: Int64
    let websiteId: String
}

public struct DatabuddyTrackOptions: Equatable {
    public var anonymousId: String?
    public var namespace: String?
    public var sessionId: String?
    public var source: String?
    public var timestamp: Date?

    public init(
        anonymousId: String? = nil,
        sessionId: String? = nil,
        source: String? = nil,
        namespace: String? = nil,
        timestamp: Date? = nil
    ) {
        self.anonymousId = anonymousId?.trimmed.nonEmpty
        self.sessionId = sessionId?.trimmed.nonEmpty
        self.source = source?.trimmed.nonEmpty
        self.namespace = namespace?.trimmed.nonEmpty
        self.timestamp = timestamp
    }
}
