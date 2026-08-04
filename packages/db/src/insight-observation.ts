import { LEGACY_INSIGHT_ANNOTATION_PREFIX } from "@databuddy/shared/insights";
import { and, desc, eq, sql, type SQLWrapper } from "drizzle-orm";
import { insightObservations } from "./drizzle/schema/insights";

const LEGACY_INSIGHT_ANNOTATION_DATE_LENGTH = 10;
const LEGACY_INSIGHT_ANNOTATION_DATE_SEPARATOR = ": ";
// JavaScript's String#trim removes this exact ECMAScript whitespace set. Keep
// SQL parity so a whitespace-only legacy annotation cannot be trusted by one
// reader and quarantined by another.
const LEGACY_INSIGHT_ANNOTATION_TRIM_CHARACTERS =
	" \t\n\r\f\v\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff";
const LEGACY_INSIGHT_ANNOTATION_DATE_START =
	LEGACY_INSIGHT_ANNOTATION_PREFIX.length + 1;
const LEGACY_INSIGHT_ANNOTATION_SEPARATOR_START =
	LEGACY_INSIGHT_ANNOTATION_DATE_START + LEGACY_INSIGHT_ANNOTATION_DATE_LENGTH;
const LEGACY_INSIGHT_ANNOTATION_TITLE_START =
	LEGACY_INSIGHT_ANNOTATION_SEPARATOR_START +
	LEGACY_INSIGHT_ANNOTATION_DATE_SEPARATOR.length;

function isValidLegacyAnnotationDate(value: SQLWrapper) {
	const year = sql<number>`substring(${value} from 1 for 4)::integer`;
	const month = sql<number>`substring(${value} from 6 for 2)::integer`;
	const day = sql<number>`substring(${value} from 9 for 2)::integer`;
	return sql<boolean>`
		case
			when ${value} ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
			then ${day} <= case
				when ${month} = 2 then case
					when mod(${year}, 4) = 0
						and (mod(${year}, 100) <> 0 or mod(${year}, 400) = 0)
					then 29
					else 28
				end
				when ${month} in (4, 6, 9, 11) then 30
				else 31
			end
			else false
		end
	`;
}

function hasLegacyAnnotationEvidence(source: SQLWrapper) {
	const evidence = sql<string>`substring(candidate.value from ${LEGACY_INSIGHT_ANNOTATION_DATE_START} for ${LEGACY_INSIGHT_ANNOTATION_DATE_LENGTH})`;
	return sql`
		exists (
			select 1
			from jsonb_array_elements_text(
				case
					when jsonb_typeof(${source}) = 'array' then ${source}
					else '[]'::jsonb
				end
		) as candidate(value)
			where left(candidate.value, ${LEGACY_INSIGHT_ANNOTATION_PREFIX.length}) = ${LEGACY_INSIGHT_ANNOTATION_PREFIX}
				and substring(candidate.value from ${LEGACY_INSIGHT_ANNOTATION_SEPARATOR_START} for ${LEGACY_INSIGHT_ANNOTATION_DATE_SEPARATOR.length}) = ${LEGACY_INSIGHT_ANNOTATION_DATE_SEPARATOR}
				and btrim(
					substring(candidate.value from ${LEGACY_INSIGHT_ANNOTATION_TITLE_START}),
					${LEGACY_INSIGHT_ANNOTATION_TRIM_CHARACTERS}
				) <> ''
				and ${isValidLegacyAnnotationDate(evidence)}
		)
	`;
}

/**
 * SQL counterpart to `isQuarantinedInsightObservation` for chronological
 * history and public-list queries.
 */
export function isTrustedInsightObservation(source: {
	evidence: SQLWrapper;
	outcome: SQLWrapper;
}) {
	const outcomeEvidence = sql`${source.outcome}->'evidence'`;
	return sql`not (
		${hasLegacyAnnotationEvidence(source.evidence)}
		or ${hasLegacyAnnotationEvidence(outcomeEvidence)}
	)`;
}

/**
 * Current-state readers must not make an older trusted observation current
 * again when a newer row is quarantined. Evaluate trust only after locating
 * the physical latest observation for this durable investigation.
 */
export function hasTrustedLatestInsightObservation(source: {
	id: SQLWrapper;
	organizationId: SQLWrapper;
	websiteId: SQLWrapper;
}) {
	return sql<boolean>`coalesce(
		(
			select ${isTrustedInsightObservation(insightObservations)}
			from ${insightObservations}
			where ${and(
				eq(insightObservations.insightId, source.id),
				eq(insightObservations.organizationId, source.organizationId),
				eq(insightObservations.websiteId, source.websiteId)
			)}
			order by
				${desc(insightObservations.asOf)},
				${desc(insightObservations.createdAt)},
				${desc(insightObservations.id)}
			limit 1
		),
		false
	)`;
}
