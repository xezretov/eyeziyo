-- Wipe all institutional structure (directions / courses / groups / subjects).
-- Keeps the institution itself + admin user so onboarding can rebuild fresh.
--
-- Order: groups (refs hierarchy_nodes) -> subjects (refs hierarchy_nodes)
-- -> hierarchy_nodes. Self-referencing parent_id on hierarchy_nodes is
-- not enforced in D1, so a single DELETE wipes the whole tree.

DELETE FROM groups_v2;
DELETE FROM subjects;
DELETE FROM hierarchy_nodes;
