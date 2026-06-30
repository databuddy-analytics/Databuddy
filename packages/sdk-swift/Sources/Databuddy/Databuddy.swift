import Foundation

public enum Databuddy {
    private static let lock = NSLock()
    private static var sharedClient: DatabuddyClient?

    public static func configure(
        clientId: String,
        apiURL: URL = DatabuddyConfiguration.defaultAPIURL,
        source: String? = DatabuddyConfiguration.defaultSource,
        namespace: String? = nil,
        enabled: Bool = true,
        flushAt: Int = 10,
        flushInterval: TimeInterval = 2.0,
        maxQueueSize: Int = 1_000,
        storage: DatabuddyStorage = UserDefaultsDatabuddyStorage()
    ) {
        configure(
            DatabuddyConfiguration(
                clientId: clientId,
                apiURL: apiURL,
                source: source,
                namespace: namespace,
                enabled: enabled,
                flushAt: flushAt,
                flushInterval: flushInterval,
                maxQueueSize: maxQueueSize
            ),
            storage: storage
        )
    }

    public static func configure(
        _ configuration: DatabuddyConfiguration,
        storage: DatabuddyStorage = UserDefaultsDatabuddyStorage()
    ) {
        let client = DatabuddyClient(configuration: configuration, storage: storage)
        lock.withDatabuddyLock {
            sharedClient = client
        }
    }

    public static func track(
        _ name: String,
        properties: [String: DatabuddyPropertyValue] = [:],
        options: DatabuddyTrackOptions = DatabuddyTrackOptions()
    ) {
        guard let client = currentClient() else {
            return
        }

        Task {
            await client.track(name, properties: properties, options: options)
        }
    }

    public static func trackAsync(
        _ name: String,
        properties: [String: DatabuddyPropertyValue] = [:],
        options: DatabuddyTrackOptions = DatabuddyTrackOptions()
    ) async {
        guard let client = currentClient() else {
            return
        }

        await client.track(name, properties: properties, options: options)
    }

    public static func trackScreen(
        _ screenName: String,
        properties: [String: DatabuddyPropertyValue] = [:],
        options: DatabuddyTrackOptions = DatabuddyTrackOptions()
    ) {
        guard let client = currentClient() else {
            return
        }

        Task {
            await client.trackScreen(
                screenName,
                properties: properties,
                options: options
            )
        }
    }

    public static func trackScreenAsync(
        _ screenName: String,
        properties: [String: DatabuddyPropertyValue] = [:],
        options: DatabuddyTrackOptions = DatabuddyTrackOptions()
    ) async {
        guard let client = currentClient() else {
            return
        }

        await client.trackScreen(
            screenName,
            properties: properties,
            options: options
        )
    }

    public static func flush() async -> DatabuddyFlushResult {
        guard let client = currentClient() else {
            return DatabuddyFlushResult(success: true, sent: 0, remaining: 0)
        }
        return await client.flush()
    }

    public static func setEnabled(_ enabled: Bool) async {
        guard let client = currentClient() else {
            return
        }
        await client.setEnabled(enabled)
    }

    private static func currentClient() -> DatabuddyClient? {
        lock.withDatabuddyLock {
            sharedClient
        }
    }
}

private extension NSLock {
    func withDatabuddyLock<T>(_ body: () throws -> T) rethrows -> T {
        lock()
        defer { unlock() }
        return try body()
    }
}
