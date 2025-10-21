import { CompressionTypes, Kafka } from 'kafkajs';

const BROKER = process.env.KAFKA_BROKERS as string;
console.log('BROKER', BROKER);

const kafka = new Kafka({
  clientId: 'basket',
  brokers: [BROKER],
});

const producer = kafka.producer({
  allowAutoTopicCreation: true,
});

let connected = false;
await producer.connect();
connected = true;

export const sendEventSync = async (topic: string, event: any, key?: string) => {
  try {
    await producer.send({
      topic,
      messages: [{ 
        value: JSON.stringify(event),
        key: key || event.client_id
      }],
      timeout: 10000,
      compression: CompressionTypes.GZIP,
    });
  } catch (err) {
    console.error('Failed to send event', err);
    throw err;
  }
};

export const sendEvent = async (topic: string, event: any, key?: string) => {
  try {
    producer.send({
      topic,
      messages: [{ 
        value: JSON.stringify(event),
        key: key || event.client_id
      }],
      timeout: 10000,
      compression: CompressionTypes.GZIP,
    });
  } catch (err) {
    console.error('Failed to send event', err);
    throw err;
  }
};

export const disconnectProducer = async () => {
  if (connected) {
    await producer.disconnect();
    connected = false;
  }
};
