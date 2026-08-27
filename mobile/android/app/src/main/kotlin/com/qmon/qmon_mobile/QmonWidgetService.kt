package com.qmon.qmon_mobile

import android.content.Context
import android.content.Intent
import android.appwidget.AppWidgetManager
import android.widget.RemoteViews
import android.widget.RemoteViewsService
import es.antonborri.home_widget.HomeWidgetPlugin
import org.json.JSONArray

class QmonWidgetService : RemoteViewsService() {
    override fun onGetViewFactory(intent: Intent): RemoteViewsFactory {
        val appWidgetId = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
        return QmonWidgetFactory(this.applicationContext, appWidgetId)
    }
}

class QmonWidgetFactory(private val context: Context, private val appWidgetId: Int) : RemoteViewsService.RemoteViewsFactory {
    private var widgetData: JSONArray = JSONArray()

    override fun onCreate() {
        loadData()
    }

    override fun onDataSetChanged() {
        loadData()
    }

    private fun loadData() {
        try {
            val prefs = HomeWidgetPlugin.getData(context)
            val configuredProviderId = prefs.getString("widget_provider_$appWidgetId", null)
            val jsonString = prefs.getString("providers_json", "[]")
            val allProviders = JSONArray(jsonString)
            
            widgetData = JSONArray()
            if (configuredProviderId != null) {
                for (i in 0 until allProviders.length()) {
                    val provider = allProviders.getJSONObject(i)
                    if (provider.getString("id") == configuredProviderId) {
                        widgetData = provider.getJSONArray("quotas")
                        break
                    }
                }
            } else if (allProviders.length() > 0) {
                // Fallback to first provider if not configured
                widgetData = allProviders.getJSONObject(0).getJSONArray("quotas")
            }
        } catch (e: Exception) {
            widgetData = JSONArray()
            e.printStackTrace()
        }
    }

    override fun onDestroy() {
        // No-op
    }

    override fun getCount(): Int {
        return if (widgetData.length() == 0) 1 else widgetData.length()
    }

    override fun getViewAt(position: Int): RemoteViews {
        if (widgetData.length() == 0) {
            val views = RemoteViews(context.packageName, R.layout.widget_quota_item)
            views.setTextViewText(R.id.item_title, "QMON")
            views.setTextViewText(R.id.item_content, "Open App to Load Data")
            views.setProgressBar(R.id.item_progress, 100, 0, false)
            return views
        }

        val item = widgetData.getJSONObject(position)
        val views = RemoteViews(context.packageName, R.layout.widget_quota_item)
        views.setTextViewText(R.id.item_title, item.getString("title"))
        views.setTextViewText(R.id.item_content, item.getString("text"))
        views.setProgressBar(R.id.item_progress, 100, item.getDouble("percent").toInt(), false)
        
        if (item.has("color")) {
            try {
                val color = android.graphics.Color.parseColor(item.getString("color"))
                views.setTextColor(R.id.item_content, color)
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
        
        if (item.has("reset_text")) {
            views.setTextViewText(R.id.item_reset_text, item.getString("reset_text"))
        } else {
            views.setTextViewText(R.id.item_reset_text, "")
        }
        
        if (item.optBoolean("is_error", false)) {
            views.setViewVisibility(R.id.item_title, android.view.View.GONE)
            views.setViewVisibility(R.id.item_progress, android.view.View.GONE)
            views.setViewVisibility(R.id.item_reset_text, android.view.View.GONE)
        } else {
            views.setViewVisibility(R.id.item_title, android.view.View.VISIBLE)
            views.setViewVisibility(R.id.item_progress, android.view.View.VISIBLE)
            views.setViewVisibility(R.id.item_reset_text, android.view.View.VISIBLE)
        }
        
        return views
    }

    override fun getLoadingView(): RemoteViews? {
        return null
    }

    override fun getViewTypeCount(): Int {
        return 1
    }

    override fun getItemId(position: Int): Long {
        return position.toLong()
    }

    override fun hasStableIds(): Boolean {
        return true
    }
}
