import Foundation

public enum DatabuddyPropertyValue: Encodable, Equatable {
    case array([DatabuddyPropertyValue])
    case bool(Bool)
    case double(Double)
    case int(Int)
    case null
    case object([String: DatabuddyPropertyValue])
    case string(String)

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .array(let value):
            try container.encode(value)
        case .bool(let value):
            try container.encode(value)
        case .double(let value):
            try container.encode(value)
        case .int(let value):
            try container.encode(value)
        case .null:
            try container.encodeNil()
        case .object(let value):
            try container.encode(value)
        case .string(let value):
            try container.encode(value)
        }
    }
}

extension DatabuddyPropertyValue: ExpressibleByArrayLiteral {
    public init(arrayLiteral elements: DatabuddyPropertyValue...) {
        self = .array(elements)
    }
}

extension DatabuddyPropertyValue: ExpressibleByBooleanLiteral {
    public init(booleanLiteral value: Bool) {
        self = .bool(value)
    }
}

extension DatabuddyPropertyValue: ExpressibleByDictionaryLiteral {
    public init(dictionaryLiteral elements: (String, DatabuddyPropertyValue)...) {
        var object: [String: DatabuddyPropertyValue] = [:]
        for (key, value) in elements {
            object[key] = value
        }
        self = .object(object)
    }
}

extension DatabuddyPropertyValue: ExpressibleByFloatLiteral {
    public init(floatLiteral value: Double) {
        self = .double(value)
    }
}

extension DatabuddyPropertyValue: ExpressibleByIntegerLiteral {
    public init(integerLiteral value: Int) {
        self = .int(value)
    }
}

extension DatabuddyPropertyValue: ExpressibleByNilLiteral {
    public init(nilLiteral: ()) {
        self = .null
    }
}

extension DatabuddyPropertyValue: ExpressibleByStringLiteral {
    public init(stringLiteral value: String) {
        self = .string(value)
    }
}
