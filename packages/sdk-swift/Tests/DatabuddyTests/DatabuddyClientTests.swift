import XCTest
@testable import Databuddy

final class DatabuddyClientTests: XCTestCase {
    override func tearDown() {
        MockURLProtocol.requestHandler = nil
        super.tearDown()
    }

    func testFlushPostsSingleEventWithPublicClientId() async throws {
        let expectedURL = URL(string: "https://basket.example.test/track")!
        let session = makeMockSession { request in
            XCTAssertEqual(request.url, expectedURL)
            XCTAssertEqual(request.httpMethod, "POST")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Content-Type"), "application/json")

            let body = try XCTUnwrap(Self.requestBodyData(from: request))
            let json = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
            XCTAssertEqual(json["name"] as? String, "search_completed")
            XCTAssertEqual(json["websiteId"] as? String, "client_123")
            XCTAssertEqual(json["source"] as? String, "macos")
            XCTAssertEqual(json["namespace"] as? String, "native")
            XCTAssertNotNil(json["anonymousId"] as? String)
            XCTAssertNotNil(json["sessionId"] as? String)

            let properties = try XCTUnwrap(json["properties"] as? [String: Any])
            XCTAssertEqual(properties["query_length_bucket"] as? String, "4-7")
            XCTAssertEqual(properties["result_count"] as? Int, 3)
            XCTAssertNil(properties["query"])

            return HTTPURLResponse(url: expectedURL, statusCode: 200, httpVersion: nil, headerFields: nil)!
        }

        let client = makeClient(session: session)
        await client.track("search_completed", properties: [
            "query_length_bucket": "4-7",
            "result_count": 3,
        ])
        let result = await client.flush()

        XCTAssertTrue(result.success)
        XCTAssertEqual(result.sent, 1)
        XCTAssertEqual(result.remaining, 0)
    }

    func testFlushPostsBatchesAsArray() async throws {
        let session = makeMockSession { request in
            let body = try XCTUnwrap(Self.requestBodyData(from: request))
            let json = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [[String: Any]])
            XCTAssertEqual(json.map { $0["name"] as? String }, ["first_event", "second_event"])

            return HTTPURLResponse(
                url: URL(string: "https://basket.example.test/track")!,
                statusCode: 202,
                httpVersion: nil,
                headerFields: nil
            )!
        }

        let client = makeClient(session: session)
        await client.track("first_event")
        await client.track("second_event")
        let result = await client.flush()

        XCTAssertTrue(result.success)
        XCTAssertEqual(result.sent, 2)
    }

    func testTrackAutoFlushesAfterInterval() async throws {
        let delivered = expectation(description: "event delivered")
        let session = makeMockSession { request in
            let body = try XCTUnwrap(Self.requestBodyData(from: request))
            let json = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
            XCTAssertEqual(json["name"] as? String, "auto_flush_event")
            delivered.fulfill()

            return HTTPURLResponse(
                url: URL(string: "https://basket.example.test/track")!,
                statusCode: 200,
                httpVersion: nil,
                headerFields: nil
            )!
        }

        let client = makeClient(session: session, flushInterval: 0.01)
        await client.track("auto_flush_event")

        await fulfillment(of: [delivered], timeout: 1)
        let queued = await client.queuedEventCount()
        XCTAssertEqual(queued, 0)
    }


    func testDisabledClientDoesNotSend() async {
        let session = makeMockSession { _ in
            XCTFail("Disabled analytics should not make a network request")
            return HTTPURLResponse(
                url: URL(string: "https://basket.example.test/track")!,
                statusCode: 500,
                httpVersion: nil,
                headerFields: nil
            )!
        }

        let client = DatabuddyClient(
            configuration: DatabuddyConfiguration(
                clientId: "client_123",
                apiURL: URL(string: "https://basket.example.test")!,
                enabled: false
            ),
            storage: InMemoryStorage(),
            transport: URLSessionDatabuddyTransport(session: session)
        )

        await client.track("app_launched")
        let result = await client.flush()

        XCTAssertTrue(result.success)
        XCTAssertEqual(result.sent, 0)
        XCTAssertEqual(result.remaining, 0)
    }

    func testFailedFlushKeepsQueuedEventsForRetry() async {
        var responses = [500, 200]
        let session = makeMockSession { _ in
            let status = responses.removeFirst()
            return HTTPURLResponse(
                url: URL(string: "https://basket.example.test/track")!,
                statusCode: status,
                httpVersion: nil,
                headerFields: nil
            )!
        }

        let client = makeClient(session: session)
        await client.track("retry_me")

        let failed = await client.flush()
        XCTAssertFalse(failed.success)
        XCTAssertEqual(failed.sent, 0)
        XCTAssertEqual(failed.remaining, 1)
        let queuedAfterFailure = await client.queuedEventCount()
        XCTAssertEqual(queuedAfterFailure, 1)

        let retried = await client.flush()
        XCTAssertTrue(retried.success)
        XCTAssertEqual(retried.sent, 1)
        XCTAssertEqual(retried.remaining, 0)
    }

    func testScreenTrackingUsesManualScreenViewEvent() async throws {
        let session = makeMockSession { request in
            let body = try XCTUnwrap(Self.requestBodyData(from: request))
            let json = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
            XCTAssertEqual(json["name"] as? String, "screen_view")

            let properties = try XCTUnwrap(json["properties"] as? [String: Any])
            XCTAssertEqual(properties["screen"] as? String, "settings")
            XCTAssertEqual(properties["tab"] as? String, "billing")

            return HTTPURLResponse(
                url: URL(string: "https://basket.example.test/track")!,
                statusCode: 200,
                httpVersion: nil,
                headerFields: nil
            )!
        }

        let client = makeClient(session: session)
        await client.trackScreen("settings", properties: ["tab": "billing"])
        let result = await client.flush()

        XCTAssertTrue(result.success)
    }

    func testPropertyValuesEncodeJSONTypes() throws {
        let properties: [String: DatabuddyPropertyValue] = [
            "array": ["one", 2],
            "bool": true,
            "double": 3.5,
            "int": 7,
            "null": nil,
            "object": ["tier": "pro"],
            "string": "hello",
        ]

        let data = try JSONEncoder().encode(properties)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])

        XCTAssertEqual(json["bool"] as? Bool, true)
        XCTAssertEqual(json["double"] as? Double, 3.5)
        XCTAssertEqual(json["int"] as? Int, 7)
        XCTAssertEqual(json["string"] as? String, "hello")
        XCTAssertTrue(json["null"] is NSNull)

        let array = try XCTUnwrap(json["array"] as? [Any])
        XCTAssertEqual(array[0] as? String, "one")
        XCTAssertEqual(array[1] as? Int, 2)

        let object = try XCTUnwrap(json["object"] as? [String: Any])
        XCTAssertEqual(object["tier"] as? String, "pro")
    }

    private func makeClient(
        session: URLSession,
        flushInterval: TimeInterval = 0
    ) -> DatabuddyClient {
        DatabuddyClient(
            configuration: DatabuddyConfiguration(
                clientId: "client_123",
                apiURL: URL(string: "https://basket.example.test")!,
                source: "macos",
                namespace: "native",
                flushAt: 10,
                flushInterval: flushInterval
            ),
            storage: InMemoryStorage(),
            transport: URLSessionDatabuddyTransport(session: session)
        )
    }

    private func makeMockSession(
        handler: @escaping (URLRequest) throws -> HTTPURLResponse
    ) -> URLSession {
        MockURLProtocol.requestHandler = handler
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [MockURLProtocol.self]
        return URLSession(configuration: configuration)
    }

    private static func requestBodyData(from request: URLRequest) -> Data? {
        if let body = request.httpBody {
            return body
        }

        guard let stream = request.httpBodyStream else {
            return nil
        }

        stream.open()
        defer { stream.close() }

        var data = Data()
        let bufferSize = 1_024
        let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: bufferSize)
        defer { buffer.deallocate() }

        while stream.hasBytesAvailable {
            let read = stream.read(buffer, maxLength: bufferSize)
            if read > 0 {
                data.append(buffer, count: read)
            } else {
                break
            }
        }

        return data.isEmpty ? nil : data
    }
}

private final class InMemoryStorage: DatabuddyStorage {
    private var values: [String: String] = [:]

    func set(_ value: String, forKey key: String) {
        values[key] = value
    }

    func string(forKey key: String) -> String? {
        values[key]
    }
}

private final class MockURLProtocol: URLProtocol {
    static var requestHandler: ((URLRequest) throws -> HTTPURLResponse)?

    override class func canInit(with request: URLRequest) -> Bool {
        true
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest {
        request
    }

    override func startLoading() {
        guard let handler = Self.requestHandler else {
            client?.urlProtocol(self, didFailWithError: URLError(.badServerResponse))
            return
        }

        do {
            let response = try handler(request)
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: Data(#"{"status":"success"}"#.utf8))
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}
}
