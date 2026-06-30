import Foundation

public protocol DatabuddyStorage: AnyObject {
    func set(_ value: String, forKey key: String)
    func string(forKey key: String) -> String?
}

public final class UserDefaultsDatabuddyStorage: DatabuddyStorage {
    private let userDefaults: UserDefaults

    public init(userDefaults: UserDefaults = .standard) {
        self.userDefaults = userDefaults
    }

    public func set(_ value: String, forKey key: String) {
        userDefaults.set(value, forKey: key)
    }

    public func string(forKey key: String) -> String? {
        userDefaults.string(forKey: key)
    }
}
