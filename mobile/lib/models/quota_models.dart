class QuotaSnapshotResponse {
  final DateTime capturedAt;
  final List<ProviderSnapshot> providers;

  QuotaSnapshotResponse({
    required this.capturedAt,
    required this.providers,
  });

  factory QuotaSnapshotResponse.fromJson(Map<String, dynamic> json) {
    return QuotaSnapshotResponse(
      capturedAt: DateTime.parse(json['captured_at']),
      providers: (json['providers'] as List)
          .map((p) => ProviderSnapshot.fromJson(p))
          .toList(),
    );
  }
}

class ProviderSnapshot {
  final String providerId;
  String name;
  final bool isEnabled;
  final bool isAvailable;
  final DateTime capturedAt;
  final String? lastError;
  final List<Quota>? quotas;

  ProviderSnapshot({
    required this.providerId,
    required this.name,
    required this.isEnabled,
    required this.isAvailable,
    required this.capturedAt,
    this.lastError,
    this.quotas,
  });

  factory ProviderSnapshot.fromJson(Map<String, dynamic> json) {
    return ProviderSnapshot(
      providerId: json['provider_id'] ?? '',
      name: json['name'] ?? '',
      isEnabled: json['is_enabled'] ?? false,
      isAvailable: json['is_available'] ?? false,
      capturedAt: DateTime.parse(json['captured_at']),
      lastError: json['last_error'],
      quotas: json['quotas'] != null
          ? (json['quotas'] as List).map((q) => Quota.fromJson(q)).toList()
          : null,
    );
  }
}

class Quota {
  final String type;
  final double percentRemaining;
  String resetText;
  final DateTime? resetsAt;
  final String? modelKey;
  final bool isExhausted;

  Quota({
    required this.type,
    required this.percentRemaining,
    required this.resetText,
    this.resetsAt,
    this.modelKey,
    required this.isExhausted,
  });

  factory Quota.fromJson(Map<String, dynamic> json) {
    return Quota(
      type: json['quota_type']?.toString() ?? '',
      percentRemaining: (json['percent_remaining'] ?? 0).toDouble(),
      resetText: json['reset_text'] ?? '',
      resetsAt:
          json['resets_at'] != null ? DateTime.parse(json['resets_at']) : null,
      modelKey: json['model_key'],
      isExhausted: json['is_exhausted'] ?? false,
    );
  }
}
