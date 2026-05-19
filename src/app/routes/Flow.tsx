/**
 * Flow surface — the part editor (forked strudel-flow node graph).
 *
 * Wraps the inherited Workflow + sidebar in the ReactFlowProvider that
 * the node canvas needs. The provider is scoped to this route only —
 * the Arranger does not use React Flow (audit note).
 */

import { ReactFlowProvider } from '@xyflow/react';

import SidebarLayout from '@/components/layouts/sidebar-layout';
import Workflow from '@/components/workflow';

export function FlowRoute() {
  return (
    <ReactFlowProvider>
      <SidebarLayout>
        <Workflow />
      </SidebarLayout>
    </ReactFlowProvider>
  );
}
