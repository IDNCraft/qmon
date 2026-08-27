package com.qmon.qmon_mobile

import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.net.Uri
import android.widget.RemoteViews
import es.antonborri.home_widget.HomeWidgetProvider

class QmonWidgetProvider : HomeWidgetProvider() {
    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray,
        widgetData: SharedPreferences
    ) {
        appWidgetIds.forEach { widgetId ->
            val views = RemoteViews(context.packageName, R.layout.widget_layout)
            
            // Set up the intent that starts the RemoteViewsService
            val intent = Intent(context, QmonWidgetService::class.java).apply {
                putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
                data = Uri.parse(toUri(Intent.URI_INTENT_SCHEME))
            }
            
            // Set the provider name
            try {
                val configuredProviderId = widgetData.getString("widget_provider_$widgetId", null)
                val jsonString = widgetData.getString("providers_json", "[]")
                val allProviders = org.json.JSONArray(jsonString)
                
                var providerName = "QMON"
                if (configuredProviderId != null) {
                    for (i in 0 until allProviders.length()) {
                        val provider = allProviders.getJSONObject(i)
                        if (provider.getString("id") == configuredProviderId) {
                            providerName = provider.getString("name").uppercase()
                            break
                        }
                    }
                } else if (allProviders.length() > 0) {
                    providerName = allProviders.getJSONObject(0).getString("name").uppercase()
                }
                views.setTextViewText(R.id.widget_provider_name, providerName)
            } catch (e: Exception) {
                e.printStackTrace()
            }
            
            views.setRemoteAdapter(R.id.widget_list, intent)
            views.setEmptyView(R.id.widget_list, R.id.widget_empty_view)
            
            appWidgetManager.notifyAppWidgetViewDataChanged(widgetId, R.id.widget_list)
            appWidgetManager.updateAppWidget(widgetId, views)
        }
    }
}
