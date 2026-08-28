import 'dart:ui';
import 'package:flutter/material.dart';
import '../models/quota_models.dart';

class ProviderCard extends StatelessWidget {
  final ProviderSnapshot provider;
  final bool showUsedMetric;

  const ProviderCard({
    super.key,
    required this.provider,
    this.showUsedMetric = false,
  });

  List<Color> _getGradients(String id) {
    switch (id.toLowerCase()) {
      case 'claude':
        return [const Color(0xFFD946EF), const Color(0xFF8B5CF6)];
      case 'codex':
        return [const Color(0xFF0EA5E9), const Color(0xFF14B8A6)];
      case 'antigravity':
        return [const Color(0xFFEC4899), const Color(0xFFF43F5E)];
      case 'copilot':
        return [const Color(0xFF10B981), const Color(0xFF3B82F6)];
      case 'opencode':
        return [const Color(0xFF6366F1), const Color(0xFF8B5CF6)];
      default:
        return [const Color(0xFF64748B), const Color(0xFF475569)];
    }
  }

  @override
  Widget build(BuildContext context) {
    final gradients = _getGradients(provider.providerId);
    final hasError =
        provider.lastError != null && provider.lastError!.isNotEmpty;

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(20),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
          child: Container(
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.05),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(
                color: Colors.white.withValues(alpha: 0.1),
                width: 1.5,
              ),
              gradient: LinearGradient(
                colors: [
                  gradients[0].withValues(alpha: 0.15),
                  gradients[1].withValues(alpha: 0.05),
                ],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
            ),
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      provider.name,
                      style: const TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: hasError
                            ? Colors.redAccent.withValues(alpha: 0.2)
                            : Colors.greenAccent.withValues(alpha: 0.2),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Text(
                        hasError ? 'Error' : 'Active',
                        style: TextStyle(
                          color: hasError
                              ? Colors.redAccent
                              : Colors.greenAccent,
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                if (hasError)
                  Text(
                    provider.lastError!,
                    style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.7),
                      fontStyle: FontStyle.italic,
                    ),
                  )
                else if (provider.quotas != null && provider.quotas!.isNotEmpty)
                  ..._buildGroupedQuotas(provider.quotas!, gradients[0]),
              ],
            ),
          ),
        ),
      ),
    );
  }

  List<Widget> _buildGroupedQuotas(List<Quota> quotas, Color accentColor) {
    Map<String, List<Quota>> groupedQuotas = {};
    for (var q in quotas) {
      final String typeLabel = quotaTypeLabel(
        q.type,
        providerId: provider.providerId,
      );
      final String key =
          '${q.percentRemaining}|${q.resetText}|${q.isExhausted}|$typeLabel';
      if (!groupedQuotas.containsKey(key)) {
        groupedQuotas[key] = [];
      }
      groupedQuotas[key]!.add(q);
    }

    return groupedQuotas.values.map((group) {
      List<String> modelKeys = group
          .map((q) => q.modelKey?.toUpperCase() ?? '-')
          .toSet()
          .toList();
      modelKeys.sort();
      String modelName = modelKeys.join(' & ');

      List<String> qTypes = group
          .map((q) => q.type)
          .where((type) => type.isNotEmpty && type != 'model_specific')
          .map((type) => quotaTypeLabel(type, providerId: provider.providerId))
          .toSet()
          .toList();

      if (modelName == '-') {
        if (qTypes.isNotEmpty) {
          modelName = qTypes.join(', ');
        }
      } else {
        if (qTypes.isNotEmpty) {
          modelName += ' (${qTypes.join(', ')})';
        }
      }
      Quota firstQ = group.first;

      double displayPct = showUsedMetric
          ? (100 - firstQ.percentRemaining)
          : firstQ.percentRemaining;
      Color valueColor = Colors.greenAccent;

      if (firstQ.isExhausted) {
        valueColor = Colors.redAccent;
      } else if (showUsedMetric) {
        if (displayPct >= 80) {
          valueColor = Colors.redAccent;
        } else if (displayPct >= 50) {
          valueColor = Colors.orangeAccent;
        }
      } else {
        if (displayPct < 20) {
          valueColor = Colors.redAccent;
        } else if (displayPct < 50) {
          valueColor = Colors.orangeAccent;
        }
      }

      return _buildQuotaRow(firstQ, modelName, valueColor, displayPct);
    }).toList();
  }

  Widget _buildQuotaRow(
    Quota q,
    String title,
    Color valueColor,
    double displayPct,
  ) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                title,
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.bold,
                  letterSpacing: 1.2,
                ),
              ),
              Text(
                '${displayPct.toStringAsFixed(1)}%',
                style: TextStyle(
                  color: valueColor,
                  fontWeight: FontWeight.bold,
                  fontSize: 16,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: displayPct / 100,
              backgroundColor: Colors.white.withValues(alpha: 0.1),
              valueColor: AlwaysStoppedAnimation<Color>(valueColor),
              minHeight: 6,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            q.resetText,
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.5),
              fontSize: 12,
            ),
          ),
        ],
      ),
    );
  }
}
