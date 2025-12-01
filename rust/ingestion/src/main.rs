use axum::{
    http::{HeaderName, Method},
    routing::get,
    Router,
};
use log::info;
use std::net::SocketAddr;
use tower_http::cors::CorsLayer;

#[tokio::main]
async fn main() {
    dotenv::dotenv().ok();
    env_logger::init();

    let cors = CorsLayer::new()
        .allow_origin(tower_http::cors::AllowOrigin::mirror_request())
        .allow_methods([
            Method::POST,
            Method::GET,
            Method::OPTIONS,
            Method::PUT,
            Method::DELETE,
        ])
        .allow_headers([
            HeaderName::from_static("content-type"),
            HeaderName::from_static("authorization"),
            HeaderName::from_static("x-requested-with"),
            HeaderName::from_static("databuddy-client-id"),
            HeaderName::from_static("databuddy-sdk-name"),
            HeaderName::from_static("databuddy-sdk-version"),
        ])
        .allow_credentials(true);

    let app = Router::new()
        .route("/", get(root))
        .layer(cors);

    let addr = SocketAddr::from(([0, 0, 0, 0], 4000));
    info!("Starting ingestion service on port 4000");

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn root() -> &'static str {
    "Ingestion Service Running"
}
