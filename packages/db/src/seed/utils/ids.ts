import { randomUUID } from 'node:crypto';
import type { Faker } from './faker';

export function createId(faker?: Faker): string {
	return faker ? faker.string.uuid() : randomUUID();
}
