import {
  Html,
  Head,
  Body,
  Container,
  Heading,
  Text,
  Link,
  Hr,
  Section,
  Row,
  Column,
} from '@react-email/components';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TaskItem {
  id: string;
  title: string;
  clientName: string | null;
  daysOverdue?: number;
  dueDate?: string;
}

interface DailyDigestProps {
  userName: string;
  appUrl: string;
  overdueItems: TaskItem[];
  dueSoonItems: TaskItem[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DailyDigest({
  userName,
  appUrl,
  overdueItems,
  dueSoonItems,
}: DailyDigestProps) {
  return (
    <Html lang="en">
      <Head />
      <Body
        style={{
          backgroundColor: '#f9fafb',
          fontFamily:
            'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          margin: 0,
          padding: 0,
        }}
      >
        <Container
          style={{
            maxWidth: 560,
            margin: '0 auto',
            padding: '40px 20px',
          }}
        >
          {/* Header */}
          <Heading
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: '#111827',
              margin: '0 0 4px',
            }}
          >
            Daily Digest
          </Heading>
          <Text
            style={{
              color: '#6b7280',
              marginTop: 0,
              marginBottom: 24,
              fontSize: 14,
            }}
          >
            Good morning, {userName}. Here is your task summary for today.
          </Text>

          {/* Overdue Section */}
          {overdueItems.length > 0 && (
            <Section>
              <Hr style={{ borderColor: '#e5e7eb', margin: '0 0 16px' }} />
              <Heading
                as="h2"
                style={{
                  fontSize: 15,
                  color: '#dc2626',
                  fontWeight: 600,
                  margin: '0 0 12px',
                }}
              >
                Overdue ({overdueItems.length})
              </Heading>
              {overdueItems.map((item) => (
                <Row key={item.id} style={{ marginBottom: 12 }}>
                  <Column>
                    <Link
                      href={`${appUrl}/tasks/${item.id}`}
                      style={{
                        color: '#dc2626',
                        fontWeight: 500,
                        fontSize: 14,
                        textDecoration: 'none',
                        display: 'block',
                      }}
                    >
                      {item.title}
                    </Link>
                    <Text
                      style={{
                        color: '#6b7280',
                        fontSize: 13,
                        margin: '2px 0 0',
                      }}
                    >
                      {item.clientName ?? 'No client'} &middot;{' '}
                      {item.daysOverdue ?? 0} day
                      {item.daysOverdue !== 1 ? 's' : ''} overdue
                    </Text>
                  </Column>
                </Row>
              ))}
            </Section>
          )}

          {/* Due Soon Section */}
          {dueSoonItems.length > 0 && (
            <Section>
              <Hr style={{ borderColor: '#e5e7eb', margin: '0 0 16px' }} />
              <Heading
                as="h2"
                style={{
                  fontSize: 15,
                  color: '#d97706',
                  fontWeight: 600,
                  margin: '0 0 12px',
                }}
              >
                Due Soon ({dueSoonItems.length})
              </Heading>
              {dueSoonItems.map((item) => (
                <Row key={item.id} style={{ marginBottom: 12 }}>
                  <Column>
                    <Link
                      href={`${appUrl}/tasks/${item.id}`}
                      style={{
                        color: '#111827',
                        fontWeight: 500,
                        fontSize: 14,
                        textDecoration: 'none',
                        display: 'block',
                      }}
                    >
                      {item.title}
                    </Link>
                    <Text
                      style={{
                        color: '#6b7280',
                        fontSize: 13,
                        margin: '2px 0 0',
                      }}
                    >
                      {item.clientName ?? 'No client'} &middot; Due {item.dueDate}
                    </Text>
                  </Column>
                </Row>
              ))}
            </Section>
          )}

          {/* All clear */}
          {overdueItems.length === 0 && dueSoonItems.length === 0 && (
            <Section>
              <Hr style={{ borderColor: '#e5e7eb', margin: '0 0 16px' }} />
              <Text
                style={{
                  color: '#059669',
                  fontWeight: 500,
                  fontSize: 14,
                  margin: 0,
                }}
              >
                All caught up. No overdue or upcoming tasks.
              </Text>
            </Section>
          )}

          {/* Footer */}
          <Hr style={{ borderColor: '#e5e7eb', margin: '24px 0 16px' }} />
          <Link
            href={`${appUrl}/dashboard`}
            style={{ color: '#6366f1', fontSize: 13 }}
          >
            Open Filio Dashboard
          </Link>
          <Text
            style={{ color: '#9ca3af', fontSize: 12, marginTop: 8 }}
          >
            You are receiving this because you have an active Filio account.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default DailyDigest;
