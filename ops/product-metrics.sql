WITH clean_events AS (
  SELECT name, session_id, day, created_at
  FROM product_events
  WHERE is_qa = 0
),
study_depth AS (
  SELECT
    session_id,
    COUNT(*) AS records,
    COUNT(DISTINCT day) AS record_days
  FROM clean_events
  WHERE name IN ('timer_completed', 'session_added')
  GROUP BY session_id
),
spans AS (
  SELECT
    session_id,
    julianday(MAX(day)) - julianday(MIN(day)) AS span_days
  FROM clean_events
  GROUP BY session_id
),
funnel AS (
  SELECT
    COUNT(DISTINCT CASE WHEN name = 'visited' THEN session_id END) AS users,
    COUNT(DISTINCT CASE WHEN name = 'material_created' THEN session_id END) AS material_creators,
    COUNT(DISTINCT CASE WHEN name IN ('timer_completed', 'session_added') THEN session_id END) AS study_recorders,
    COUNT(DISTINCT CASE WHEN name = 'timer_completed' THEN session_id END) AS timer_users,
    COUNT(DISTINCT CASE WHEN name = 'session_added' THEN session_id END) AS manual_recorders,
    COUNT(DISTINCT CASE WHEN name = 'review_opened' THEN session_id END) AS reviewers,
    COUNT(DISTINCT CASE WHEN name = 'share_card_saved' THEN session_id END) AS share_card_users,
    COUNT(DISTINCT CASE WHEN name = 'printed' THEN session_id END) AS printers,
    COUNT(DISTINCT CASE WHEN name = 'project_exported' THEN session_id END) AS exporters,
    COUNT(DISTINCT CASE WHEN name = 'project_imported' THEN session_id END) AS importers,
    COUNT(DISTINCT CASE WHEN name = 'returned' THEN session_id END) AS returned,
    COUNT(DISTINCT CASE
      WHEN name IN ('timer_completed', 'session_added')
       AND created_at >= unixepoch() - 604800 THEN session_id
    END) AS study_recorders_7d
  FROM clean_events
)
SELECT
  funnel.*,
  (SELECT COUNT(*) FROM study_depth WHERE records >= 5 AND record_days >= 3)
    AS five_records_three_days,
  (SELECT COUNT(*) FROM spans WHERE span_days >= 7)
    AS users_spanning_7d
FROM funnel;
