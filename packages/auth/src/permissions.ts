import { createAccessControl } from 'better-auth/plugins/access';
import {
	adminAc,
	defaultStatements,
	memberAc,
	ownerAc,
} from 'better-auth/plugins/organization/access';

const statement = {
	...defaultStatements,

	website: [
		'create',
		'read',
		'update',
		'delete',
		'configure',
		'view_analytics',
		'manage_tracking',
		'transfer',
	],

	organization: ['read', 'update', 'manage_logo', 'manage_settings', 'delete'],

	subscription: ['read', 'update', 'cancel', 'manage_billing', 'view_usage'],

	invitation: ['create', 'cancel'],
} as const;

const ac = createAccessControl(statement);

const viewer = ac.newRole({
	website: ['read', 'view_analytics'],
	organization: ['read'],
	subscription: ['read'],
});

const member = ac.newRole({
	website: ['read', 'configure', 'view_analytics', 'manage_tracking'],
	subscription: ['read', 'view_usage'],
	organization: ['read'],
	member: memberAc.statements.member,
	invitation: memberAc.statements.invitation,
});

const admin = ac.newRole({
	website: [
		'create',
		'read',
		'update',
		'delete',
		'configure',
		'view_analytics',
		'manage_tracking',
		'transfer',
	],
	subscription: ['read', 'view_usage'],
	organization: ['read', 'update', 'manage_logo'],
	member: adminAc.statements.member,
	invitation: adminAc.statements.invitation,
});

const owner = ac.newRole({
	website: [
		'create',
		'read',
		'update',
		'delete',
		'configure',
		'view_analytics',
		'manage_tracking',
		'transfer',
	],
	subscription: ['read', 'update', 'cancel', 'manage_billing', 'view_usage'],
	organization: ['read', 'update', 'manage_logo', 'manage_settings', 'delete'],
	member: ownerAc.statements.member,
	invitation: ownerAc.statements.invitation,
});

export { ac, owner, admin, member, viewer };
