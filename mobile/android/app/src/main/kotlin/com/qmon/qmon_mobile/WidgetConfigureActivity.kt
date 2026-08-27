package com.qmon.qmon_mobile

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.os.Bundle
import android.widget.ArrayAdapter
import android.widget.ListView
import es.antonborri.home_widget.HomeWidgetPlugin
import org.json.JSONArray
import org.json.JSONObject

class WidgetConfigureActivity : Activity() {
    private var appWidgetId = AppWidgetManager.INVALID_APPWIDGET_ID
    private val providers = mutableListOf<ProviderItem>()

    data class ProviderItem(val id: String, val name: String) {
        override fun toString(): String = name
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Set result CANCELED. This causes the widget host to cancel
        // out of the widget placement if the user presses the back button.
        setResult(RESULT_CANCELED)

        setContentView(R.layout.widget_configure)

        // Find the widget id from the intent.
        val intent = intent
        val extras = intent.extras
        if (extras != null) {
            appWidgetId = extras.getInt(
                AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID
            )
        }

        // If this activity was started with an intent without an app widget ID, finish with an error.
        if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
            finish()
            return
        }

        // Load providers from SharedPreferences
        val prefs = HomeWidgetPlugin.getData(this)
        val jsonString = prefs.getString("providers_json", "[]")
        
        try {
            val jsonArray = JSONArray(jsonString)
            for (i in 0 until jsonArray.length()) {
                val obj = jsonArray.getJSONObject(i)
                providers.add(ProviderItem(obj.getString("id"), obj.getString("name")))
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }

        val listView = findViewById<ListView>(R.id.provider_list)
        val adapter = ArrayAdapter(this, R.layout.widget_configure_item, android.R.id.text1, providers)
        listView.adapter = adapter

        listView.setOnItemClickListener { _, _, position, _ ->
            val selectedProvider = providers[position]
            
            // Save the selected provider for this widget
            prefs.edit().putString("widget_provider_$appWidgetId", selectedProvider.id).apply()
            
            // Push an update to this specific widget
            val appWidgetManager = AppWidgetManager.getInstance(this)
            val updateIntent = Intent(AppWidgetManager.ACTION_APPWIDGET_UPDATE, null, this, QmonWidgetProvider::class.java)
            updateIntent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, intArrayOf(appWidgetId))
            sendBroadcast(updateIntent)

            // Make sure we pass back the original appWidgetId
            val resultValue = Intent()
            resultValue.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
            setResult(RESULT_OK, resultValue)
            finish()
        }
    }
}
