import 'package:flutter/material.dart';
import '../models/quota_models.dart';

/// Summary strip mirroring TUI SummaryCards (desktop layout):
/// Providers count, Exhausted count, Display mode — same derivation logic.
class SummaryCards extends StatelessWidget {
  final List<ProviderSnapshot> providers;
  final bool showUsedMetric;
  final bool showAbsoluteTime;

  const SummaryCards({
    super.key,
    required this.providers,
    required this.showUsedMetric,
    required this.showAbsoluteTime,
  });

  @override
  Widget build(BuildContext context) {
    // Same as TUI: unique provider names (already hidden-filtered upstream).
    final uniqueCount = providers.map((p) => p.name).toSet().length;
    final exhaustedCount = providers.fold<int>(
      0,
      (acc, p) =>
          acc + (p.quotas?.where((q) => q.isExhausted).length ?? 0),
    );
    final exhausted = providers.any(
      (p) => p.quotas?.any((q) => q.isExhausted) ?? false,
    );
    final metricLabel = showUsedMetric ? 'Used %' : 'Remaining %';
    final timeLabel = showAbsoluteTime ? 'Absolute' : 'Relative';

    return LayoutBuilder(
      builder: (context, constraints) {
        // Narrow screens (portrait phones): stack vertically like TUI compact.
        if (constraints.maxWidth < 420) {
          return Padding(
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 2),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _SummaryCard(
                  label: 'Providers',
                  value: '$uniqueCount',
                  valueColor: const Color(0xFF00ADB5),
                ),
                const SizedBox(height: 8),
                _SummaryCard(
                  label: 'Exhausted',
                  value: '$exhaustedCount',
                  valueColor: exhausted
                      ? const Color(0xFFFF2E93)
                      : const Color(0xFF4CAF50),
                ),
                const SizedBox(height: 8),
                _SummaryCard(
                  label: 'Display',
                  value: '$metricLabel · $timeLabel',
                  valueColor: const Color(0xFFFFD369),
                ),
              ],
            ),
          );
        }
        // Wide screens: 3-column row like TUI desktop.
        return Padding(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 2),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: _SummaryCard(
                  label: 'Providers',
                  value: '$uniqueCount',
                  valueColor: const Color(0xFF00ADB5),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _SummaryCard(
                  label: 'Exhausted',
                  value: '$exhaustedCount',
                  valueColor: exhausted
                      ? const Color(0xFFFF2E93)
                      : const Color(0xFF4CAF50),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                flex: 2,
                child: _SummaryCard(
                  label: 'Display',
                  value: '$metricLabel · $timeLabel',
                  valueColor: const Color(0xFFFFD369),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _SummaryCard extends StatelessWidget {
  final String label;
  final String value;
  final Color valueColor;

  const _SummaryCard({
    required this.label,
    required this.value,
    required this.valueColor,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: Colors.white.withValues(alpha: 0.1),
          width: 1,
        ),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            label,
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.55),
              fontSize: 13,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            value,
            style: TextStyle(
              color: valueColor,
              fontWeight: FontWeight.bold,
              fontSize: 15,
            ),
          ),
        ],
      ),
    );
  }
}
