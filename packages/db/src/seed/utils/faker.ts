import { Faker, en, base } from '@faker-js/faker';

/**
 * Create a dedicated Faker instance so seeding can run with deterministic
 * randomness when a seed is provided.
 */
export function createFaker(seed?: number): Faker {
	const faker = new Faker({ locale: [en, base] });

	if (typeof seed === 'number') {
		faker.seed(seed);
	}

	return faker;
}

export type { Faker } from '@faker-js/faker';
