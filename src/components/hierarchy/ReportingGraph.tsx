'use client';

import { useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  BackgroundVariant,
  MarkerType,
} from '@xyflow/react';
import dagre from '@dagrejs/dagre';
import '@xyflow/react/dist/style.css';
import type { ReportingStructure } from '@/actions/hierarchy';

// ---------------------------------------------------------------------------
// Node dimensions — dagre needs to know the size of each node to space them
// ---------------------------------------------------------------------------
const NODE_WIDTH  = 180;
const NODE_HEIGHT = 64;

// ---------------------------------------------------------------------------
// runDagreLayout
// Converts our flat list of nodes + edges into positioned nodes.
//
// dagre is a graph layout library that implements the Sugiyama algorithm:
// it figures out the "rank" (vertical level) of each node, then spaces
// them horizontally within each rank. The result is a clean top-down org chart.
// ---------------------------------------------------------------------------

function runDagreLayout(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph();

  g.setGraph({
    rankdir: 'TB',   // top → bottom
    ranksep: 80,     // vertical gap between levels
    nodesep: 40,     // horizontal gap between nodes on same level
  });

  g.setDefaultEdgeLabel(() => ({}));

  nodes.forEach((node) => {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });

  edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target);
  });

  dagre.layout(g);

  // dagre gives us centre-points; React Flow uses top-left corners
  return nodes.map((node) => {
    const { x, y } = g.node(node.id);
    return {
      ...node,
      position: { x: x - NODE_WIDTH / 2, y: y - NODE_HEIGHT / 2 },
    };
  });
}

// ---------------------------------------------------------------------------
// PersonNode — custom card rendered inside each React Flow node
// ---------------------------------------------------------------------------

function PersonNode({ data }: { data: { name: string; role?: string; colour?: string } }) {
  return (
    <div
      style={{ width: NODE_WIDTH }}
      className="rounded-lg border border-border bg-background shadow-sm px-3 py-2.5 select-none"
    >
      <div className="flex items-center gap-1.5">
        {data.colour && (
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: data.colour }}
          />
        )}
        <p className="text-sm font-medium text-foreground truncate">{data.name}</p>
      </div>
      {data.role && (
        <p className="text-xs text-muted-foreground mt-0.5 pl-4 truncate">{data.role}</p>
      )}
    </div>
  );
}

const nodeTypes = { person: PersonNode };

// ---------------------------------------------------------------------------
// ReportingGraph
// ---------------------------------------------------------------------------

interface Props {
  data: ReportingStructure;
}

export function ReportingGraph({ data }: Props) {
  const { profiles, roles, relationships } = data;

  const roleMap = new Map(roles.map((r) => [r.id, r]));

  // Build React Flow nodes + edges, then run dagre layout
  const { nodes, edges } = useMemo(() => {
    // One node per active profile
    const rawNodes: Node[] = profiles.map((p) => {
      const role = p.role_id ? roleMap.get(p.role_id) : null;
      return {
        id:       p.id,
        type:     'person',
        position: { x: 0, y: 0 },   // dagre will override
        data: {
          name:   p.full_name,
          role:   role?.name,
          colour: role?.colour,
        },
      };
    });

    // One edge per relationship: manager → report (top-down)
    const rawEdges: Edge[] = relationships.map((rel) => ({
      id:            `${rel.manager_id}-${rel.report_id}`,
      source:        rel.manager_id,
      target:        rel.report_id,
      type:          'smoothstep',
      animated:      false,
      markerEnd:     { type: MarkerType.ArrowClosed, width: 16, height: 16 },
      style:         { stroke: 'hsl(var(--border))', strokeWidth: 1.5 },
    }));

    // dagre needs at least one edge to compute layout; fall back to a grid
    const positionedNodes =
      rawEdges.length > 0
        ? runDagreLayout(rawNodes, rawEdges)
        : rawNodes.map((n, i) => ({
            ...n,
            position: { x: (i % 4) * (NODE_WIDTH + 40), y: Math.floor(i / 4) * (NODE_HEIGHT + 40) },
          }));

    return { nodes: positionedNodes, edges: rawEdges };
  }, [profiles, roles, relationships]);

  if (profiles.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 rounded-lg border border-dashed border-border">
        <p className="text-sm text-muted-foreground">No team members yet.</p>
      </div>
    );
  }

  return (
    // The outer div needs an explicit height — React Flow renders into it
    <div className="rounded-lg border border-border overflow-hidden" style={{ height: 520 }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        nodesDraggable
        nodesConnectable={false}   // connections are managed in the list view
        elementsSelectable
        minZoom={0.3}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} className="opacity-40" />
        <Controls showInteractive={false} />
        <MiniMap
          nodeColor={() => 'hsl(var(--muted))'}
          maskColor="hsl(var(--background) / 0.7)"
          className="!border-border"
        />
      </ReactFlow>
    </div>
  );
}
