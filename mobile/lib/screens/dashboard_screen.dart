import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:intl/intl.dart';
import '../services/api_service.dart';
import '../models/quota_models.dart';
import '../widgets/provider_card.dart';
import '../widgets/summary_cards.dart';
import 'settings_screen.dart';
import 'login_screen.dart';
import 'package:home_widget/home_widget.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  final ApiService _apiService = ApiService();
  QuotaSnapshotResponse? _snapshot;
  bool _isLoading = true;
  String? _error;
  Timer? _timer;
  bool _showUsedMetric = false;
  bool _showAbsoluteTime = false;
  List<String> _hiddenProviders = [];
  bool _isLoggedIn = false;

  @override
  void initState() {
    super.initState();
    _restoreAuthState();
    _loadData();
    // Auto-refresh every 30 seconds to match CLI
    _timer = Timer.periodic(const Duration(seconds: 30), (timer) {
      _loadData();
    });
  }

  Future<void> _restoreAuthState() async {
    final token = await _apiService.getToken();
    if (!mounted) return;
    setState(() => _isLoggedIn = token != null);
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _loadData() async {
    // Only show full-screen spinner on first load
    if (_snapshot == null) {
      setState(() {
        _isLoading = true;
      });
    }

    try {
      final prefs = await SharedPreferences.getInstance();
      _showUsedMetric = prefs.getBool('show_used_metric') ?? false;
      _showAbsoluteTime = prefs.getBool('show_absolute_time') ?? false;
      _hiddenProviders = prefs.getStringList('hidden_providers') ?? [];

      final snapshot = await _apiService.fetchSnapshot();

      // Filter out hidden providers
      snapshot.providers.removeWhere((p) => _hiddenProviders.contains(p.name));

      // Transform metrics if needed
      for (var p in snapshot.providers) {
        if (p.providerId.toLowerCase() == 'opencode' ||
            p.name.toLowerCase().startsWith('opencode')) {
          p.name = p.name.replaceFirst(
            RegExp(r'opencode', caseSensitive: false),
            'OpenCode Go',
          );
        }
        if (p.quotas != null) {
          for (var q in p.quotas!) {
            if (_showAbsoluteTime && q.resetsAt != null) {
              final DateFormat formatter = DateFormat('M/d/yyyy, h:mm:ss a');
              String formatted = formatter.format(q.resetsAt!.toLocal());

              if (q.resetText.contains('Exhausted — ')) {
                q.resetText = q.resetText.replaceFirst(
                  RegExp(r'Exhausted — .*'),
                  'Exhausted until $formatted',
                );
              } else if (q.resetText.contains('(Resets on ')) {
                q.resetText = q.resetText.replaceFirst(
                  RegExp(r'\(Resets on [^\)]+\)'),
                  '(Resets at $formatted)',
                );
              } else if (q.resetText.contains('(Resets in ')) {
                q.resetText = q.resetText.replaceFirst(
                  RegExp(r'\(Resets in [^\)]+\)'),
                  '(Resets at $formatted)',
                );
              } else if (q.resetText.contains('Resets in ')) {
                q.resetText = q.resetText.replaceFirst(
                  RegExp(r'Resets in .*'),
                  'Resets at $formatted',
                );
              } else if (q.resetText.contains('Refreshes in ')) {
                q.resetText = q.resetText.replaceFirst(
                  RegExp(r'Refreshes in .*'),
                  'Refreshes at $formatted',
                );
              }
            } else if (!_showAbsoluteTime && q.resetsAt != null) {
              final diff = q.resetsAt!.toLocal().difference(DateTime.now());
              if (diff.isNegative) {
                // Already reset or unknown
              } else {
                final d = diff.inDays;
                final h = diff.inHours % 24;
                final m = diff.inMinutes % 60;
                String relStr = '';
                if (d > 0) relStr += '${d}d ';
                if (h > 0 || d > 0) relStr += '${h}h ';
                relStr += '${m}m';
                q.resetText = q.resetText.replaceAll(
                  RegExp(r'\(Resets on \d{4}-\d{2}-\d{2}\)'),
                  '(Resets in ${relStr.trim()})',
                );
              }
            }
          }

          // Sort quotas within provider: exhausted first, then lowest remaining
          p.quotas!.sort((a, b) {
            if (a.isExhausted && !b.isExhausted) return -1;
            if (!a.isExhausted && b.isExhausted) return 1;
            if (a.percentRemaining != b.percentRemaining) {
              return a.percentRemaining.compareTo(b.percentRemaining);
            }
            return (a.modelKey ?? '').compareTo(b.modelKey ?? '');
          });
        }
      }

      // Sort providers: active first, exhausted next, errors/empty at the bottom
      snapshot.providers.sort((a, b) {
        final aQuotas = a.quotas ?? [];
        final bQuotas = b.quotas ?? [];

        bool aExhausted = aQuotas.any((q) => q.isExhausted);
        bool bExhausted = bQuotas.any((q) => q.isExhausted);
        int getSortGroup(ProviderSnapshot provider, bool exhausted) {
          final quotas = provider.quotas ?? [];
          if (!provider.isAvailable || quotas.isEmpty) return 2;
          return exhausted ? 1 : 0;
        }

        final groupDifference =
            getSortGroup(a, aExhausted) - getSortGroup(b, bExhausted);
        if (groupDifference != 0) {
          return groupDifference;
        }

        return a.name.toLowerCase().compareTo(b.name.toLowerCase());
      });

      if (mounted) {
        setState(() {
          _snapshot = snapshot;
          _isLoading = false;
          _error = null;
        });
        _updateWidget(snapshot);
      }
    } catch (e) {
      if (e.toString().contains('401')) {
        await _apiService.clearToken();
        if (!mounted) return;
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(builder: (context) => const LoginScreen()),
        );
        return;
      }
      setState(() {
        _error = e.toString();
        _isLoading = false;
      });
    }
  }

  Future<void> _updateWidget(QuotaSnapshotResponse snapshot) async {
    try {
      List<Map<String, dynamic>> providersData = [];

      for (var provider in snapshot.providers) {
        List<Map<String, dynamic>> quotasData = [];

        if (provider.quotas != null && provider.quotas!.isNotEmpty) {
          // Group identical quotas
          Map<String, List<Quota>> groupedQuotas = {};
          for (var q in provider.quotas!) {
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

          for (var group in groupedQuotas.values) {
            List<String> modelKeys = group
                .map((q) => q.modelKey?.toUpperCase() ?? '-')
                .toSet()
                .toList();
            modelKeys.sort();
            String modelName = modelKeys.join(' & ');

            List<String> qTypes = group
                .map((q) => q.type)
                .where((type) => type.isNotEmpty && type != 'model_specific')
                .map(
                  (type) =>
                      quotaTypeLabel(type, providerId: provider.providerId),
                )
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

            double displayPct = _showUsedMetric
                ? (100 - firstQ.percentRemaining)
                : firstQ.percentRemaining;
            String colorHex = "#00E676"; // GreenAccent

            if (firstQ.isExhausted) {
              colorHex = "#FF5252";
            } else if (_showUsedMetric) {
              if (displayPct >= 80) {
                colorHex = "#FF5252";
              } else if (displayPct >= 50) {
                colorHex = "#FFD740";
              }
            } else {
              if (displayPct < 20) {
                colorHex = "#FF5252";
              } else if (displayPct < 50) {
                colorHex = "#FFD740";
              }
            }

            quotasData.add({
              'title': modelName,
              'percent': displayPct,
              'text': '${displayPct.toStringAsFixed(1)}%',
              'reset_text': firstQ.resetText,
              'color': colorHex,
              'is_error': false,
            });
          }
        } else {
          // Provider has no quotas (e.g., error state or inactive)
          String statusText =
              provider.lastError != null && provider.lastError!.isNotEmpty
              ? provider.lastError!
              : 'No Data';

          if (statusText.length > 25) {
            statusText = '${statusText.substring(0, 22)}...';
          }

          quotasData.add({
            'title': '',
            'percent': 0.0,
            'text': statusText,
            'reset_text': '',
            'color': '#B0BEC5', // Default Grey
            'is_error': true,
          });
        }

        providersData.add({
          'id': '${provider.providerId}_${provider.name}',
          'name': provider.name,
          'quotas': quotasData,
        });
      }

      await HomeWidget.saveWidgetData<String>(
        'providers_json',
        json.encode(providersData),
      );
      await HomeWidget.updateWidget(
        androidName: 'QmonWidgetProvider',
        iOSName: 'QmonWidget',
      );
    } catch (e) {
      debugPrint('Failed to update widget: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('QMON DASHBOARD'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => _loadData(),
          ),
          if (_isLoggedIn)
            IconButton(
              icon: const Icon(Icons.settings),
              onPressed: () async {
                await Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (context) => const SettingsScreen(),
                  ),
                );
                _loadData();
              },
            ),
          if (_isLoggedIn)
            IconButton(
              icon: const Icon(Icons.logout),
              onPressed: () async {
                final navigator = Navigator.of(context);
                await _apiService.clearToken();
                if (!mounted) return;
                setState(() => _isLoggedIn = false);
                navigator.pushReplacement(
                  MaterialPageRoute(builder: (context) => const LoginScreen()),
                );
              },
            ),
        ],
      ),
      body: Container(
        decoration: const BoxDecoration(
          image: DecorationImage(
            image: NetworkImage(
              'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?q=80&w=3270&auto=format&fit=crop',
            ),
            fit: BoxFit.cover,
            colorFilter: ColorFilter.mode(Colors.black87, BlendMode.darken),
          ),
        ),
        child: _buildBody(),
      ),
    );
  }

  Widget _buildBody() {
    if (_isLoading) {
      return const Center(
        child: CircularProgressIndicator(color: Colors.cyanAccent),
      );
    }

    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(20.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(
                Icons.error_outline,
                color: Colors.redAccent,
                size: 60,
              ),
              const SizedBox(height: 16),
              Text(
                'Connection Failed\n$_error',
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.white70, fontSize: 16),
              ),
              const SizedBox(height: 20),
              ElevatedButton(
                onPressed: () {
                  Navigator.of(context).pushReplacement(
                    MaterialPageRoute(
                      builder: (context) => const LoginScreen(),
                    ),
                  );
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.white10,
                  foregroundColor: Colors.white,
                ),
                child: Text(_isLoggedIn ? 'Retry' : 'Connect & Sign In'),
              ),
            ],
          ),
        ),
      );
    }

    if (_snapshot == null || _snapshot!.providers.isEmpty) {
      return const Center(
        child: Text(
          'No providers configured.',
          style: TextStyle(color: Colors.white54),
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: () => _loadData(),
      color: Colors.cyanAccent,
      backgroundColor: Colors.black87,
      child: ListView.builder(
        physics: const BouncingScrollPhysics(),
        padding: const EdgeInsets.only(top: 4, bottom: 40),
        itemCount: _snapshot!.providers.length + 1,
        itemBuilder: (context, index) {
          if (index == 0) {
            return SummaryCards(
              providers: _snapshot!.providers,
              showUsedMetric: _showUsedMetric,
              showAbsoluteTime: _showAbsoluteTime,
            );
          }
          final provider = _snapshot!.providers[index - 1];
          return ProviderCard(
            provider: provider,
            showUsedMetric: _showUsedMetric,
          );
        },
      ),
    );
  }
}
