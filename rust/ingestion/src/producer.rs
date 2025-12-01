use log::error;
use rdkafka::config::ClientConfig;
use rdkafka::producer::{FutureProducer, FutureRecord, Producer};
use rdkafka::util::Timeout;
use std::env;
use std::time::Duration;

#[derive(Clone)]
pub struct KafkaProducer {
    producer: FutureProducer,
}

impl KafkaProducer {
    pub fn new() -> Self {
        let broker = env::var("REDPANDA_BROKER").expect("REDPANDA_BROKER is not set");
        let username = env::var("REDPANDA_USER").ok();
        let password = env::var("REDPANDA_PASSWORD").ok();

        let mut config = ClientConfig::new();
        config
            .set("bootstrap.servers", &broker)
            .set("message.timeout.ms", "5000")
            .set("socket.timeout.ms", "3000");

        if let (Some(u), Some(p)) = (username, password) {
            config
                .set("security.protocol", "SASL_PLAINTEXT")
                .set("sasl.mechanisms", "SCRAM-SHA-256")
                .set("sasl.username", &u)
                .set("sasl.password", &p);
        }

        let producer: FutureProducer = config.create().expect("Producer creation error");

        KafkaProducer { producer }
    }

    pub async fn send(&self, topic: &str, key: &str, payload: &str) -> Result<(), String> {
        let record = FutureRecord::to(topic).payload(payload).key(key);

        match self
            .producer
            .send(record, Timeout::After(Duration::from_secs(5)))
            .await
        {
            Ok(_) => Ok(()),
            Err((e, _)) => Err(format!("Kafka send error: {:?}", e)),
        }
    }

    pub fn check_health(&self) -> bool {
        match self
            .producer
            .client()
            .fetch_metadata(None, Duration::from_secs(2))
        {
            Ok(_) => true,
            Err(e) => {
                error!("Health check failed: {:?}", e);
                false
            }
        }
    }
}
