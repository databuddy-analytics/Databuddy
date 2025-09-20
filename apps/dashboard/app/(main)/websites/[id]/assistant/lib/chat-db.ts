import { type DBSchema, type IDBPDatabase, openDB } from 'idb';
import type { Message } from '../types/message';

// Database schema interface
interface ChatDBSchema extends DBSchema {
	chats: {
		key: string; // websiteId
		value: {
			websiteId: string;
			websiteName?: string;
			lastUpdated: number;
			messageCount: number;
		};
		indexes: {
			'by-lastUpdated': number;
		};
	};
	messages: {
		key: string; // messageId
		value: Message & {
			websiteId: string;
			chatId: string; // same as websiteId for now, could expand to multiple chats per website
		};
		indexes: {
			'by-websiteId': string;
			'by-chatId': string;
			'by-timestamp': number;
		};
	};
}

class ChatDatabase {
	private dbPromise: Promise<IDBPDatabase<ChatDBSchema>>;
	private readonly DB_NAME = 'databuddy-databunny';
	private readonly DB_VERSION = 1;

	constructor() {
		this.dbPromise = this.initDB();
	}

	private async initDB(): Promise<IDBPDatabase<ChatDBSchema>> {
		return await openDB<ChatDBSchema>(this.DB_NAME, this.DB_VERSION, {
			upgrade(db) {
				// Create chats store
				const chatsStore = db.createObjectStore('chats', {
					keyPath: 'websiteId',
				});
				chatsStore.createIndex('by-lastUpdated', 'lastUpdated');

				// Create messages store
				const messagesStore = db.createObjectStore('messages', {
					keyPath: 'id',
				});
				messagesStore.createIndex('by-websiteId', 'websiteId');
				messagesStore.createIndex('by-chatId', 'chatId');
				messagesStore.createIndex('by-timestamp', 'timestamp');
			},
		});
	}

	// Chat management
	async createOrUpdateChat(
		websiteId: string,
		websiteName?: string
	): Promise<void> {
		const db = await this.dbPromise;
		const messageCount = await this.getMessageCount(websiteId);

		await db.put('chats', {
			websiteId,
			websiteName,
			lastUpdated: Date.now(),
			messageCount,
		});
	}

	async getChat(websiteId: string) {
		const db = await this.dbPromise;
		return db.get('chats', websiteId);
	}

	async getAllChats() {
		const db = await this.dbPromise;
		const chats = await db.getAll('chats');
		return chats.sort((a, b) => b.lastUpdated - a.lastUpdated);
	}

	async deleteChat(websiteId: string): Promise<void> {
		const db = await this.dbPromise;
		const tx = db.transaction(['chats', 'messages'], 'readwrite');

		// Delete chat
		await tx.objectStore('chats').delete(websiteId);

		// Delete all messages for this website
		const messagesStore = tx.objectStore('messages');
		const index = messagesStore.index('by-websiteId');
		const messageKeys = await index.getAllKeys(websiteId);

		await Promise.all(messageKeys.map((key) => messagesStore.delete(key)));
		await tx.done;
	}

	// Message management
	async saveMessage(
		message: Message,
		websiteId: string,
		chatId?: string
	): Promise<void> {
		const db = await this.dbPromise;
		const messageWithMeta = {
			...message,
			websiteId,
			chatId: chatId || websiteId,
			timestamp: new Date(message.timestamp), // Ensure it's a Date object
		};

		await db.put('messages', messageWithMeta);

		// Update chat metadata
		await this.createOrUpdateChat(websiteId);
	}

	async getMessages(websiteId: string, chatId?: string): Promise<Message[]> {
		const db = await this.dbPromise;
		const index = db.transaction('messages').store.index('by-chatId');
		const messages = await index.getAll(chatId || websiteId);

		// Sort by timestamp and convert back to Message format
		return messages
			.sort(
				(a, b) =>
					new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
			)
			.map(({ websiteId: _, chatId: __, ...message }) => ({
				...message,
				timestamp: new Date(message.timestamp),
			}));
	}

	async saveMessages(
		messages: Message[],
		websiteId: string,
		chatId?: string
	): Promise<void> {
		const db = await this.dbPromise;
		const tx = db.transaction('messages', 'readwrite');

		for (const message of messages) {
			const messageWithMeta = {
				...message,
				websiteId,
				chatId: chatId || websiteId,
				timestamp: new Date(message.timestamp),
			};
			await tx.store.put(messageWithMeta);
		}

		await tx.done;
		await this.createOrUpdateChat(websiteId);
	}

	async deleteMessage(messageId: string): Promise<void> {
		const db = await this.dbPromise;
		await db.delete('messages', messageId);
	}

	async clearMessages(websiteId: string, chatId?: string): Promise<void> {
		const db = await this.dbPromise;
		const tx = db.transaction('messages', 'readwrite');
		const index = tx.store.index('by-chatId');
		const messageKeys = await index.getAllKeys(chatId || websiteId);

		await Promise.all(messageKeys.map((key) => tx.store.delete(key)));
		await tx.done;

		// Update chat metadata
		await this.createOrUpdateChat(websiteId);
	}

	async getMessageCount(websiteId: string, chatId?: string): Promise<number> {
		const db = await this.dbPromise;
		const index = db.transaction('messages').store.index('by-chatId');
		return index.count(chatId || websiteId);
	}

	// Utility methods
	async exportChat(websiteId: string) {
		const chat = await this.getChat(websiteId);
		const messages = await this.getMessages(websiteId);
		return { chat, messages };
	}

	async importChat(
		websiteId: string,
		data: { messages: Message[]; websiteName?: string }
	): Promise<void> {
		await this.clearMessages(websiteId);
		await this.saveMessages(data.messages, websiteId);
		await this.createOrUpdateChat(websiteId, data.websiteName);
	}

	async getDatabaseStats() {
		const db = await this.dbPromise;
		const chatCount = await db.count('chats');
		const messageCount = await db.count('messages');

		return {
			totalChats: chatCount,
			totalMessages: messageCount,
			dbName: this.DB_NAME,
			dbVersion: this.DB_VERSION,
		};
	}

	// Clear all data (useful for testing/reset)
	async clearAllData(): Promise<void> {
		const db = await this.dbPromise;
		const tx = db.transaction(['chats', 'messages'], 'readwrite');
		await Promise.all([
			tx.objectStore('chats').clear(),
			tx.objectStore('messages').clear(),
		]);
		await tx.done;
	}
}

// Singleton instance
let chatDB: ChatDatabase | null = null;

export function getChatDB(): ChatDatabase {
	if (!chatDB) {
		chatDB = new ChatDatabase();
	}
	return chatDB;
}

export type { ChatDBSchema };
export { ChatDatabase };
