import 'package:flutter_test/flutter_test.dart';

import 'package:qmon_mobile/services/api_service.dart';

void main() {
  test('development URL takes precedence over saved URL', () {
    expect(
      ApiService.resolveBaseUrl(
        savedUrl: 'http://old-host:8080',
        developmentUrl: 'http://192.168.1.6:8080',
      ),
      'http://192.168.1.6:8080',
    );
  });

  test('saved URL remains the fallback outside development', () {
    expect(
      ApiService.resolveBaseUrl(
        savedUrl: 'http://configured-host:8080',
        developmentUrl: 'http://dev-host:8080',
        isDevelopment: false,
      ),
      'http://configured-host:8080',
    );
  });
}
