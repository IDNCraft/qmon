import 'package:flutter/material.dart';
import '../services/api_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  final ApiService _apiService = ApiService();
  final TextEditingController _urlController = TextEditingController();
  bool _isTesting = false;
  String? _testResult;
  bool _isSuccess = false;

  bool _showUsedMetric = false;
  bool _showAbsoluteTime = false;
  List<String> _hiddenProviders = [];
  List<String> _availableProviders = [];
  bool _isLoggedIn = false;

  @override
  void initState() {
    super.initState();
    _loadCurrentUrl();
  }

  Future<void> _loadCurrentUrl() async {
    final url = await _apiService.getBaseUrl();
    final prefs = await SharedPreferences.getInstance();
    final token = await _apiService.getToken();

    if (mounted) {
      setState(() {
        _urlController.text = url;
        _isLoggedIn = token != null;
        _showUsedMetric = prefs.getBool('show_used_metric') ?? false;
        _showAbsoluteTime = prefs.getBool('show_absolute_time') ?? false;
        _hiddenProviders = prefs.getStringList('hidden_providers') ?? [];
      });
    }

    try {
      final snapshot = await _apiService.fetchSnapshot();
      if (!mounted) return;
      setState(() {
        _availableProviders = snapshot.providers.map((p) => p.name).toList();
      });
    } catch (_) {
      // Keep URL/settings available when the dev daemon is offline.
    }
  }

  Future<void> _toggleProvider(String providerName) async {
    final prefs = await SharedPreferences.getInstance();
    setState(() {
      if (_hiddenProviders.contains(providerName)) {
        _hiddenProviders.remove(providerName);
      } else {
        _hiddenProviders.add(providerName);
      }
    });
    await prefs.setStringList('hidden_providers', _hiddenProviders);
  }

  Future<void> _toggleMetric(bool value) async {
    final prefs = await SharedPreferences.getInstance();
    setState(() {
      _showUsedMetric = value;
    });
    await prefs.setBool('show_used_metric', value);
  }

  Future<void> _toggleTime(bool value) async {
    final prefs = await SharedPreferences.getInstance();
    setState(() {
      _showAbsoluteTime = value;
    });
    await prefs.setBool('show_absolute_time', value);
  }

  Future<void> _saveAndTest() async {
    setState(() {
      _isTesting = true;
      _testResult = null;
    });

    final url = _urlController.text.trim();
    if (url.isEmpty) {
      setState(() {
        _testResult = 'URL cannot be empty';
        _isTesting = false;
        _isSuccess = false;
      });
      return;
    }

    await _apiService.setBaseUrl(url);
    final isHealthy = await _apiService.checkHealth();

    setState(() {
      _isTesting = false;
      if (isHealthy) {
        _isSuccess = true;
        _testResult = 'Successfully connected to Qmon Server!';
      } else {
        _isSuccess = false;
        _testResult = 'Failed to connect. Is the Go daemon running?';
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('SETTINGS')),
      body: SingleChildScrollView(
        child: Container(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Qmon Server URL',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: Colors.white,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                'Enter the address of the device running the Qmon server, e.g. your Mac or PC on the same network. (e.g. http://192.168.1.5:8080)',
                style: TextStyle(
                  color: Colors.white.withValues(alpha: 0.6),
                  fontSize: 14,
                ),
              ),
              const SizedBox(height: 24),
              TextField(
                controller: _urlController,
                decoration: InputDecoration(
                  filled: true,
                  fillColor: Colors.white.withValues(alpha: 0.05),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide.none,
                  ),
                  hintText: 'http://192.168.x.x:8080',
                  prefixIcon: const Icon(Icons.link, color: Colors.cyanAccent),
                ),
                style: const TextStyle(color: Colors.white),
                keyboardType: TextInputType.url,
              ),
              const SizedBox(height: 24),
              SizedBox(
                width: double.infinity,
                height: 50,
                child: ElevatedButton(
                  onPressed: _isTesting ? null : _saveAndTest,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.cyanAccent.withValues(alpha: 0.2),
                    foregroundColor: Colors.cyanAccent,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  child: _isTesting
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Text(
                          'Save & Test Connection',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                ),
              ),
              if (_testResult != null)
                Padding(
                  padding: const EdgeInsets.only(top: 24),
                  child: Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: _isSuccess
                          ? Colors.greenAccent.withValues(alpha: 0.1)
                          : Colors.redAccent.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: _isSuccess
                            ? Colors.greenAccent.withValues(alpha: 0.3)
                            : Colors.redAccent.withValues(alpha: 0.3),
                      ),
                    ),
                    child: Row(
                      children: [
                        Icon(
                          _isSuccess ? Icons.check_circle : Icons.error,
                          color: _isSuccess
                              ? Colors.greenAccent
                              : Colors.redAccent,
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            _testResult!,
                            style: TextStyle(
                              color: _isSuccess
                                  ? Colors.greenAccent
                                  : Colors.redAccent,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              // Dashboard preferences only make sense once signed in —
              // guests see just the server connection section.
              if (_isLoggedIn) ...[
                const SizedBox(height: 32),
                const Text(
                  'Dashboard Settings',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 16),
                SwitchListTile(
                  title: const Text('Show Used Metric'),
                  subtitle: const Text(
                    'Display used percentage instead of remaining',
                  ),
                  value: _showUsedMetric,
                  onChanged: _toggleMetric,
                  thumbColor: WidgetStateProperty.resolveWith(
                    (states) => states.contains(WidgetState.selected)
                        ? Colors.cyanAccent
                        : null,
                  ),
                ),
                SwitchListTile(
                  title: const Text('Show Absolute Time'),
                  subtitle: const Text(
                    'Display exact time instead of relative',
                  ),
                  value: _showAbsoluteTime,
                  onChanged: _toggleTime,
                  thumbColor: WidgetStateProperty.resolveWith(
                    (states) => states.contains(WidgetState.selected)
                        ? Colors.cyanAccent
                        : null,
                  ),
                ),
                const SizedBox(height: 24),
                const Text(
                  'Hide Providers',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 8),
                ..._availableProviders.map((providerName) {
                  return CheckboxListTile(
                    title: Text(providerName),
                    value: _hiddenProviders.contains(providerName),
                    onChanged: (bool? value) {
                      _toggleProvider(providerName);
                    },
                    activeColor: Colors.cyanAccent,
                  );
                }),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
