import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Theme, GROUP_COLORS, OVER_DOT } from '../theme';
import { SpendGroup } from '../data';
import { Icon } from './Icon';

interface Props {
  theme: Theme;
  groups: SpendGroup[];
  income: number;
  compact?: boolean;
}

export function HomeSpendGroups({ theme, groups, income, compact }: Props) {
  return (
    <View>
      {groups.map((g, i) => (
        <GroupPanel
          key={g.key}
          theme={theme}
          group={g}
          income={income}
          last={i === groups.length - 1}
          compact={compact}
        />
      ))}
    </View>
  );
}

function GroupPanel({
  theme,
  group,
  income,
  last,
  compact,
}: {
  theme: Theme;
  group: SpendGroup;
  income: number;
  last: boolean;
  compact?: boolean;
}) {
  const color = theme.dark ? GROUP_COLORS[group.key].dark : GROUP_COLORS[group.key].light;
  const groupTotal = group.subs.reduce((s, x) => s + x.spent, 0);
  const actualPct = income > 0 ? groupTotal / income : 0;
  const fill = Math.min(actualPct / group.targetPct, 1);

  const goodWhenOver = group.key === 'savings';
  const onTrack = goodWhenOver
    ? actualPct >= group.targetPct * 0.9
    : actualPct <= group.targetPct * 1.05;
  const barColor = onTrack ? color : OVER_DOT;
  const statusText = goodWhenOver
    ? onTrack ? 'on track' : 'below target'
    : onTrack ? 'on track' : 'over budget';

  // Very subtle group-tinted header background
  const headerTint = theme.dark
    ? `${color}12`
    : `${color}0D`;

  return (
    <View
      style={[
        s.panel,
        { borderBottomColor: theme.sep, borderBottomWidth: last ? 0 : 1 },
      ]}
    >
      {/* Tinted header zone */}
      <View style={[s.headerZone, { backgroundColor: headerTint }]}>
        <View style={s.headerRow}>
          <View style={s.labelRow}>
            <View style={[s.groupDot, { backgroundColor: color }]} />
            <Text style={[s.groupLabel, { color }]}>
              {group.label.toUpperCase()}
            </Text>
          </View>
          <Text style={[s.groupTotal, { color: theme.text }]}>
            ${groupTotal.toLocaleString()}
          </Text>
        </View>

        <View style={[s.track, { backgroundColor: theme.dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)' }]}>
          <View style={[s.fill, { width: `${fill * 100}%`, backgroundColor: barColor }]} />
        </View>

        <Text style={[s.meta, { color: theme.textTer }]}>
          {Math.round(actualPct * 100)}% of {Math.round(group.targetPct * 100)}% target
          {'  ·  '}
          <Text style={{ color: onTrack ? color : OVER_DOT }}>
            {statusText}
          </Text>
        </Text>
      </View>

      {!compact && (
        <View style={s.subContent}>
          {group.key === 'wants' ? (
            <WantsChips theme={theme} group={group} color={color} />
          ) : (
            <DetailRows
              theme={theme}
              group={group}
              color={color}
              isSavings={group.key === 'savings'}
            />
          )}
        </View>
      )}
    </View>
  );
}

// Needs / Savings: compact always-visible rows with individual progress bars
function DetailRows({
  theme,
  group,
  color,
  isSavings,
}: {
  theme: Theme;
  group: SpendGroup;
  color: string;
  isSavings: boolean;
}) {
  return (
    <View style={s.detailList}>
      {group.subs.map(sub => {
        const pct = sub.budget > 0 ? Math.min(sub.spent / sub.budget, 1) : 0;
        const over = !isSavings && sub.spent > sub.budget;
        const funded = sub.spent >= sub.budget;
        const subBarColor = over ? OVER_DOT : color;

        return (
          <View key={sub.label} style={s.detailRow}>
            <View style={[s.iconWrap, { backgroundColor: `${color}18` }]}>
              <Icon name={sub.icon} size={14} color={color} stroke={1.5} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={s.subHeaderRow}>
                <Text style={[s.subName, { color: theme.text }]} numberOfLines={1}>
                  {sub.label}
                </Text>
                <View style={s.subAmtGroup}>
                  {funded && isSavings && (
                    <Text style={[s.check, { color }]}>✓{'  '}</Text>
                  )}
                  <Text style={[s.subSpent, { color: over ? OVER_DOT : theme.text }]}>
                    ${sub.spent.toLocaleString()}
                  </Text>
                  {!funded && (
                    <Text style={[s.subBudget, { color: theme.textTer }]}>
                      {'  /  $'}{sub.budget.toLocaleString()}
                    </Text>
                  )}
                </View>
              </View>
              <View style={[s.subTrack, { backgroundColor: theme.hairline }]}>
                <View
                  style={[s.subFill, { width: `${pct * 100}%`, backgroundColor: subBarColor }]}
                />
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function WantsChips({
  theme,
  group,
  color,
}: {
  theme: Theme;
  group: SpendGroup;
  color: string;
}) {
  const total = group.subs.reduce((s, x) => s + x.spent, 0);

  return (
    <View>
      {/* Proportional breakdown bar */}
      <View style={s.propBar}>
        {group.subs.map((sub, i) => {
          const ratio = total > 0 ? sub.spent / total : 0;
          const isFirst = i === 0;
          const isLast = i === group.subs.length - 1;
          return (
            <View
              key={sub.label}
              style={{
                flex: ratio,
                height: '100%',
                backgroundColor: color,
                opacity: 0.4 + ratio * 0.5,
                marginLeft: isFirst ? 0 : 2,
                borderTopLeftRadius: isFirst ? 3 : 0,
                borderBottomLeftRadius: isFirst ? 3 : 0,
                borderTopRightRadius: isLast ? 3 : 0,
                borderBottomRightRadius: isLast ? 3 : 0,
              }}
            />
          );
        })}
      </View>

      {/* Rows — same language as DetailRows, without per-item progress bars */}
      <View>
        {group.subs.map((sub, i) => (
          <View
            key={sub.label}
            style={[
              s.wantRow,
              {
                borderBottomWidth: i < group.subs.length - 1 ? 1 : 0,
                borderBottomColor: theme.hairline,
              },
            ]}
          >
            <View style={[s.iconWrap, { backgroundColor: `${color}18` }]}>
              <Icon name={sub.icon} size={14} color={color} stroke={1.5} />
            </View>
            <Text style={[s.wantLabel, { color: theme.text }]} numberOfLines={1}>
              {sub.label}
            </Text>
            <Text style={[s.wantAmt, { color: theme.text }]}>
              ${sub.spent.toLocaleString()}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  panel: {
    paddingBottom: 4,
  },

  // Tinted header
  headerZone: {
    paddingHorizontal: 12,
    paddingTop: 14,
    paddingBottom: 12,
    borderRadius: 10,
    marginBottom: 2,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  groupDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  groupLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.7,
  },
  groupTotal: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  track: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 8,
  },
  fill: {
    height: '100%',
    borderRadius: 3,
  },
  meta: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: -0.1,
  },

  // Sub content wrapper
  subContent: {
    paddingTop: 12,
    paddingBottom: 16,
  },

  // Detail rows (Needs / Savings)
  detailList: {
    gap: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  subHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 5,
  },
  subName: {
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: -0.2,
    flex: 1,
    marginRight: 8,
  },
  subAmtGroup: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexShrink: 0,
  },
  check: {
    fontSize: 11,
    fontWeight: '700',
  },
  subSpent: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  subBudget: {
    fontSize: 11,
    fontWeight: '400',
    letterSpacing: -0.1,
  },
  subTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  subFill: {
    height: '100%',
    borderRadius: 2,
  },

  // Wants: proportional bar + rows
  propBar: {
    height: 5,
    flexDirection: 'row',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 8,
  },
  wantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  wantLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: -0.2,
  },
  wantAmt: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
});
