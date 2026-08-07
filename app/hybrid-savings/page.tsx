"use client";
import { PageSection, Title, TextContent, EmptyState, EmptyStateBody } from "@patternfly/react-core";
import { CubesIcon } from "@patternfly/react-icons";
import ComingSoonRibbon from "@/components/ComingSoonRibbon/ComingSoonRibbon";
import styles from './hybrid-savings.module.css';

export default function HybridSavingsPage() {
  return (
    <ComingSoonRibbon>
      <div style={{ padding: '20px 24px 0' }}>
        <h1 className={styles.pageTitle}>Hybrid savings</h1>
      </div>
      <PageSection>
        <EmptyState>
          <CubesIcon />
          <Title headingLevel="h2" size="lg">Coming soon</Title>
          <EmptyStateBody>
            This tool is coming soon.
          </EmptyStateBody>
        </EmptyState>
      </PageSection>
    </ComingSoonRibbon>
  );
}
