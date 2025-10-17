export const schemaPrompt = `\
<schema>
    <description>The schema of the database you are querying.</description>
    <table>
        <name>analytics.events</name>
        <description>Contains all user interaction events like page views, clicks, etc.</description>
        <columns>
        [
            {"name": "client_id", "type": "String", "description": "Website identifier"},
            {"name": "event_name", "type": "String", "description": "Type of event (screen_view, page_exit, etc)"},
            {"name": "time", "type": "DateTime64", "description": "Event timestamp"},
            {"name": "path", "type": "String", "description": "URL path of the page"},
            {"name": "title", "type": "String", "description": "Page title"},
            {"name": "referrer", "type": "String", "description": "Referrer URL"},
            {"name": "country", "type": "String", "description": "User country code (e.g., US, IN)"},
            {"name": "region", "type": "String", "description": "Geographic region or state (e.g., California)"},
            {"name": "timezone", "type": "String", "description": "User's timezone (e.g., America/New_York)"},
            {"name": "browser_name", "type": "String", "description": "Browser name"},
            {"name": "os_name", "type": "String", "description": "Operating system"},
            {"name": "device_type", "type": "String", "description": "Device type (desktop, mobile, tablet)"},
            {"name": "language", "type": "String", "description": "Browser language code (e.g., en-US, fr-FR)"},
            {"name": "utm_source", "type": "String", "description": "UTM source parameter"},
            {"name": "utm_medium", "type": "String", "description": "UTM medium parameter"},
            {"name": "utm_campaign", "type": "String", "description": "UTM campaign parameter"},
            {"name": "utm_term", "type": "String", "description": "UTM term parameter"},
            {"name": "utm_content", "type": "String", "description": "UTM content parameter"},
            {"name": "session_id", "type": "String", "description": "User session identifier"},
            {"name": "anonymous_id", "type": "String", "description": "Anonymous user identifier"},
            {"name": "time_on_page", "type": "Float32", "description": "Time spent on page in seconds"},
            {"name": "scroll_depth", "type": "Float32", "description": "Page scroll depth percentage"},
            {"name": "is_bounce", "type": "UInt8", "description": "Whether this was a bounce (1) or not (0)"},
            {"name": "exit_intent", "type": "UInt8", "description": "Whether an exit intent was detected (1) or not (0)"},
            {"name": "load_time", "type": "Int32", "description": "Page load time in milliseconds"},
            {"name": "ttfb", "type": "Int32", "description": "Time to first byte in milliseconds"},
            {"name": "dom_ready_time", "type": "Int32", "description": "DOM ready time in milliseconds"},
            {"name": "render_time", "type": "Int32", "description": "Page render time in milliseconds"},
        ]
        </columns>
    </table>
    <table>
        <name>analytics.errors</name>
        <description>Contains detailed information about JavaScript and other client-side errors.</description>
        <columns>
            [
            {"name": "client_id", "type": "String", "description": "Website identifier"},
            {"name": "timestamp", "type": "DateTime64", "description": "Error timestamp"},
            {"name": "path", "type": "String", "description": "URL path where error occurred"},
            {"name": "message", "type": "String", "description": "Error message"},
            {"name": "filename", "type": "String", "description": "JavaScript file where error occurred"},
            {"name": "lineno", "type": "Int32", "description": "Line number where error occurred"},
            {"name": "colno", "type": "Int32", "description": "Column number where error occurred"},
            {"name": "stack", "type": "String", "description": "Full error stack trace"},
            {"name": "error_type", "type": "String", "description": "Type of error (e.g., TypeError, ReferenceError)"},
            {"name": "anonymous_id", "type": "String", "description": "Anonymous user identifier"},
            {"name": "session_id", "type": "String", "description": "User session identifier"},
            {"name": "country", "type": "String", "description": "User country code"},
            {"name": "region", "type": "String", "description": "Geographic region"},
            {"name": "browser_name", "type": "String", "description": "Browser name"},
            {"name": "browser_version", "type": "String", "description": "Browser version"},
            {"name": "os_name", "type": "String", "description": "Operating system"},
            {"name": "os_version", "type": "String", "description": "OS version"},
            {"name": "device_type", "type": "String", "description": "Device type (desktop, mobile, tablet)"}
            ]
        </columns>
    </table>
    <table>
        <name>analytics.web_vitals</name>
        <description>Contains Core Web Vitals and performance metrics for pages.</description>
        <columns>
        [
            {"name": "client_id", "type": "String", "description": "Website identifier"},
            {"name": "timestamp", "type": "DateTime64", "description": "Performance measurement timestamp"},
            {"name": "path", "type": "String", "description": "URL path of the page"},
            {"name": "fcp", "type": "Int32", "description": "First Contentful Paint in milliseconds"},
            {"name": "lcp", "type": "Int32", "description": "Largest Contentful Paint in milliseconds"},
            {"name": "fid", "type": "Int32", "description": "First Input Delay in milliseconds"},
            {"name": "inp", "type": "Int32", "description": "Interaction to Next Paint in milliseconds"},
            {"name": "anonymous_id", "type": "String", "description": "Anonymous user identifier"},
            {"name": "session_id", "type": "String", "description": "User session identifier"},
            {"name": "country", "type": "String", "description": "User country code"},
            {"name": "region", "type": "String", "description": "Geographic region"},
            {"name": "browser_name", "type": "String", "description": "Browser name"},
            {"name": "browser_version", "type": "String", "description": "Browser version"},
            {"name": "os_name", "type": "String", "description": "Operating system"},
            {"name": "os_version", "type": "String", "description": "OS version"},
            {"name": "device_type", "type": "String", "description": "Device type (desktop, mobile, tablet)"}
        ]
        </columns>
    </table>
</schema>
`;
