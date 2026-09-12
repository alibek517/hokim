package com.hokimloyha.app.util

import android.content.Context
import android.util.Log

object MapHtmlProvider {
    private var cachedBaseHtml: String? = null

    fun getHtml(context: Context, initialLat: String = "", initialLon: String = ""): String {
        try {
            var base = cachedBaseHtml
            if (base == null) {
                val css = context.assets.open("leaflet.css").bufferedReader().use { it.readText() }
                val js = context.assets.open("leaflet.js").bufferedReader().use { it.readText() }
                val template = context.assets.open("map.html").bufferedReader().use { it.readText() }

                base = template
                    .replace("<link rel=\"stylesheet\" href=\"leaflet.css\" />", "<style>\n$css\n</style>")
                    .replace("<script src=\"leaflet.js\"></script>", "<script>\n$js\n</script>")
                cachedBaseHtml = base
            }

            val lat = initialLat.trim()
            val lon = initialLon.trim()
            return if (lat.isNotEmpty() && lon.isNotEmpty()) {
                base.replace("/*DEFAULT_COORDS*/", "pendingCoords = [$lat, $lon];")
            } else {
                base
            }
        } catch (e: Exception) {
            Log.e("MapHtmlProvider", "Error loading map HTML: ${e.message}", e)
            return ""
        }
    }
}
