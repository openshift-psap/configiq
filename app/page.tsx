"use client";
import {
  PageSection,
  Title,
  Text,
  TextContent,
  Grid,
  GridItem,
  Card,
  CardBody,
  CardTitle,
  Button,
} from "@patternfly/react-core";
import {
  BoltIcon,
  CalculatorIcon,
  MicrochipIcon,
  SearchIcon,
  CoinsIcon,
  ServerGroupIcon,
  RouteIcon,
} from "@patternfly/react-icons";
import Link from "next/link";

const tools = [
  {
    title: "Quick estimate",
    description:
      "Fast GPU sizing from a model name and workload profile. Results in seconds.",
    href: "/quick-estimate",
    icon: <BoltIcon />,
  },
  {
    title: "KV cache calculator",
    description:
      "Calculate KV cache memory requirements for any model on supported GPU systems.",
    href: "/kv-cache",
    icon: <CalculatorIcon />,
  },
  {
    title: "Advanced sizing",
    description:
      "Detailed GPU sizing with parallelism, quantization, KV cache, and cost modeling.",
    href: "/calculator",
    icon: <MicrochipIcon />,
  },
  {
    title: "GPU explorer",
    description:
      "Search and compare GPUs across memory, throughput, cost, and availability.",
    href: "/gpu-explorer",
    icon: <SearchIcon />,
  },
  {
    title: "Hybrid savings",
    description:
      "Model cost savings between cloud, on-premise, and hybrid GPU deployment strategies.",
    href: "/hybrid-savings",
    icon: <CoinsIcon />,
  },
  {
    title: "Cluster cost",
    description:
      "Estimate total cost of ownership for multi-GPU inference clusters.",
    href: "/cluster-cost",
    icon: <ServerGroupIcon />,
  },
  {
    title: "Routing economics",
    description:
      "Analyze request routing between model tiers to optimize cost vs quality tradeoffs.",
    href: "/routing",
    icon: <RouteIcon />,
  },
];

export default function HomePage() {
  return (
    <>
      <PageSection variant="light">
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', top: 0, right: 0, fontSize: '0.875rem', color: '#6A6E73' }}>
            Work in progress
          </div>
          <TextContent>
            <Title headingLevel="h1" size="2xl">
              ConfigIQ
            </Title>
            <Text component="p">
              LLM inference sizing, GPU comparison, and cost modeling for
              engineers and infrastructure teams.
            </Text>
          </TextContent>
        </div>
      </PageSection>

      <PageSection>
        <Grid hasGutter sm={12} md={6} lg={4}>
          {tools.map((tool) => (
            <GridItem key={tool.href}>
              <Card isFullHeight>
                <CardTitle>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {tool.icon}
                    {tool.title}
                  </span>
                </CardTitle>
                <CardBody>
                  <Text component="p" style={{ marginBottom: 16 }}>
                    {tool.description}
                  </Text>
                  <Button
                    variant="link"
                    isInline
                    component={(props) => <Link href={tool.href} {...props} />}
                  >
                    Open tool →
                  </Button>
                </CardBody>
              </Card>
            </GridItem>
          ))}
        </Grid>
      </PageSection>
    </>
  );
}
