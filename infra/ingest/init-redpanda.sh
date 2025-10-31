#!/bin/bash
set -e

VECTOR_KAFKA_USER="${VECTOR_KAFKA_USER}"
VECTOR_KAFKA_PASSWORD="${VECTOR_KAFKA_PASSWORD}"
REDPANDA_USER="${REDPANDA_USER}"
REDPANDA_PASSWORD="${REDPANDA_PASSWORD}"

echo "Setting up Redpanda SASL users and ACLs..."

echo "Step 1: Creating admin superuser (without SASL)..."
OUTPUT=$(rpk security user create "${REDPANDA_USER}" -p "${REDPANDA_PASSWORD}" --mechanism SCRAM-SHA-256 2>&1 || true)
if echo "${OUTPUT}" | grep -q "already exists"; then
	echo "Admin user already exists, skipping..."
elif echo "${OUTPUT}" | grep -q "Created user"; then
	echo "Admin user created successfully"
else
	echo "Warning: Failed to create admin user"
	echo "${OUTPUT}"
fi

echo "Step 2: Setting admin as superuser..."
OUTPUT=$(rpk cluster config set superusers "[\"${REDPANDA_USER}\"]" 2>&1 || true)
if echo "${OUTPUT}" | grep -q "Set\|Successfully"; then
	echo "Admin set as superuser successfully"
elif echo "${OUTPUT}" | grep -q "already"; then
	echo "Admin is already configured as superuser"
else
	echo "Warning: Failed to set superuser"
	echo "${OUTPUT}"
fi

echo "Step 3: Ensuring enterprise features are disabled (before enabling SASL)..."
# Disable audit logging (enterprise feature)
OUTPUT=$(rpk cluster config set audit_enabled false 2>&1 || true)
if echo "${OUTPUT}" | grep -q "Set\|already\|Successfully"; then
	echo "Audit logging disabled"
fi

# Disable continuous data balancing (enterprise feature)
OUTPUT=$(rpk cluster config set partition_autobalancing_mode node_add 2>&1 || true)
if echo "${OUTPUT}" | grep -q "Set\|already\|Successfully"; then
	echo "Continuous data balancing disabled"
fi

# Disable continuous intra-broker partition balancing (enterprise feature)
OUTPUT=$(rpk cluster config set core_balancing_continuous false 2>&1 || true)
if echo "${OUTPUT}" | grep -q "Set\|already\|Successfully"; then
	echo "Continuous intra-broker balancing disabled"
fi

# Disable tiered storage (enterprise feature)
OUTPUT=$(rpk cluster config set cloud_storage_enabled false 2>&1 || true)
if echo "${OUTPUT}" | grep -q "Set\|already\|Successfully"; then
	echo "Tiered storage disabled"
fi

# Disable remote read replicas (enterprise feature)
OUTPUT=$(rpk cluster config set cloud_storage_enable_remote_read false 2>&1 || true)
if echo "${OUTPUT}" | grep -q "Set\|already\|Successfully"; then
	echo "Remote read replicas disabled"
fi

# Disable leader pinning (enterprise feature)
OUTPUT=$(rpk cluster config set default_leaders_preference none 2>&1 || true)
if echo "${OUTPUT}" | grep -q "Set\|already\|Successfully"; then
	echo "Leader pinning disabled"
fi

# Disable server-side schema ID validation (enterprise feature)
OUTPUT=$(rpk cluster config set enable_schema_id_validation none 2>&1 || true)
if echo "${OUTPUT}" | grep -q "Set\|already\|Successfully"; then
	echo "Server-side schema ID validation disabled"
fi

# Ensure we're only using SCRAM (not OIDC/OAUTHBEARER which are enterprise)
OUTPUT=$(rpk cluster config set sasl_mechanisms '["SCRAM"]' 2>&1 || true)
if echo "${OUTPUT}" | grep -q "Set\|already\|Successfully"; then
	echo "SASL mechanisms set to SCRAM only"
fi

echo "Step 4: Enabling auto-create topics..."
OUTPUT=$(rpk cluster config set auto_create_topics_enabled true 2>&1 || true)
if echo "${OUTPUT}" | grep -q "Set\|Successfully"; then
	echo "Auto-create topics enabled successfully"
elif echo "${OUTPUT}" | grep -q "already"; then
	echo "Auto-create topics is already enabled"
else
	echo "Warning: Failed to enable auto-create topics"
	echo "${OUTPUT}"
fi

echo "Step 5: Enabling SASL authentication..."
OUTPUT=$(rpk cluster config set enable_sasl true 2>&1 || true)
if echo "${OUTPUT}" | grep -q "Set\|Successfully"; then
	echo "SASL enabled successfully"
elif echo "${OUTPUT}" | grep -q "already"; then
	echo "SASL is already enabled"
else
	echo "Warning: Failed to enable SASL (might already be enabled via config)"
	echo "${OUTPUT}"
fi

echo "Step 6: Waiting for SASL to be fully ready..."
sleep 3

SASL_CONFIG="-X user=${REDPANDA_USER} -X pass=${REDPANDA_PASSWORD} -X sasl.mechanism=SCRAM-SHA-256"

echo "Step 7: Creating vector-agent user (with SASL)..."
OUTPUT=$(rpk security user create "${VECTOR_KAFKA_USER}" -p "${VECTOR_KAFKA_PASSWORD}" --mechanism SCRAM-SHA-256 ${SASL_CONFIG} 2>&1 || true)
if echo "${OUTPUT}" | grep -q "already exists"; then
	echo "vector-agent user already exists, skipping..."
elif echo "${OUTPUT}" | grep -q "Created user"; then
	echo "vector-agent user created successfully"
else
	echo "Error: Failed to create vector-agent user"
	echo "${OUTPUT}"
	exit 1
fi

echo "Step 8: Setting ACL permissions for vector-agent..."
OUTPUT=$(rpk security acl create \
	--allow-principal "User:${VECTOR_KAFKA_USER}" \
	--operation read,write,create \
	--topic '*' \
	--group '*' \
	${SASL_CONFIG} 2>&1 || true)
if echo "${OUTPUT}" | grep -q "already exists"; then
	echo "ACL permissions already exist, skipping..."
elif echo "${OUTPUT}" | grep -q "Created ACL"; then
	echo "ACL permissions created successfully"
else
	echo "Warning: Failed to create ACLs (might already exist)"
	echo "${OUTPUT}"
fi

echo "Redpanda initialization completed successfully!"

