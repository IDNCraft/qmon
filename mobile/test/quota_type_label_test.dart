import 'package:flutter_test/flutter_test.dart';

import 'package:qmon_mobile/models/quota_models.dart';

void main() {
  test('formats Codex five-hour and weekly windows', () {
    expect(quotaTypeLabel('5h', providerId: 'codex'), '5h');
    expect(quotaTypeLabel('session', providerId: 'codex'), '5h');
    expect(quotaTypeLabel('weekly', providerId: 'codex'), 'Weekly');
  });

  test('keeps session label for non-Codex providers', () {
    expect(quotaTypeLabel('session', providerId: 'claude'), 'Session');
  });
}
