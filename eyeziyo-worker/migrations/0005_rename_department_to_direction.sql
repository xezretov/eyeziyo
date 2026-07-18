-- Align university hierarchy with Uzbek academic practice:
-- Students are grouped under "yo'nalish" (direction/specialty), not "kafedra".
-- Existing department nodes in university institutions are renamed to direction.
-- Kafedra as a separate admin concept can be reintroduced later if needed.

UPDATE hierarchy_nodes
  SET node_type = 'direction'
  WHERE node_type = 'department';
