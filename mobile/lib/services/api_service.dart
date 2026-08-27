import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../models/quota_models.dart';

class ApiService {
  static const String _defaultUrl = 'http://localhost:8080';
  static const String _developmentUrl = String.fromEnvironment('QMON_API_URL');
  static const String _urlKey = 'qmon_api_url';
  static const String _tokenKey = 'qmon_jwt_token';

  static String resolveBaseUrl({
    String? savedUrl,
    String developmentUrl = _developmentUrl,
    bool isDevelopment = kDebugMode,
  }) {
    if (isDevelopment && developmentUrl.isNotEmpty) return developmentUrl;
    if (savedUrl != null && savedUrl.isNotEmpty) return savedUrl;
    return _defaultUrl;
  }

  Future<String> getBaseUrl() async {
    final prefs = await SharedPreferences.getInstance();
    return resolveBaseUrl(savedUrl: prefs.getString(_urlKey));
  }

  Future<void> setBaseUrl(String url) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_urlKey, url);
  }

  Future<String?> getToken() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_tokenKey);
  }

  Future<void> setToken(String token) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_tokenKey, token);
  }

  Future<void> clearToken() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_tokenKey);
  }

  Future<bool> login(String email, String password) async {
    final baseUrl = await getBaseUrl();
    try {
      final response = await http
          .post(
            Uri.parse('$baseUrl/api/v1/auth/login'),
            headers: {'Content-Type': 'application/json'},
            body: json.encode({'email': email, 'password': password}),
          )
          .timeout(const Duration(seconds: 10));

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        final token = data['data']['j_token'];
        if (token != null) {
          await setToken(token);
          return true;
        }
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  Future<QuotaSnapshotResponse> fetchSnapshot() async {
    final baseUrl = await getBaseUrl();
    final token = await getToken();

    try {
      final response = await http
          .get(
            Uri.parse('$baseUrl/api/v1/quota/snapshot'),
            headers: token != null ? {'Authorization': 'Bearer $token'} : null,
          )
          .timeout(const Duration(seconds: 10));

      if (response.statusCode == 200) {
        final Map<String, dynamic> body = json.decode(response.body);
        return QuotaSnapshotResponse.fromJson(body['data']);
      } else {
        throw Exception('Failed to load snapshot: ${response.statusCode}');
      }
    } catch (e) {
      throw Exception('Failed to connect to API: $e');
    }
  }

  Future<bool> checkHealth() async {
    final baseUrl = await getBaseUrl();
    try {
      final response = await http
          .get(Uri.parse('$baseUrl/health'))
          .timeout(const Duration(seconds: 3));
      return response.statusCode == 200;
    } catch (e) {
      return false;
    }
  }
}
