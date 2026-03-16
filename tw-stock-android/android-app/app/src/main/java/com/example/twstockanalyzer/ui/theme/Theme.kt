package com.example.twstockanalyzer.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable

private val LightColors = lightColorScheme(
    primary = InkBlue,
    secondary = AccentGold,
    background = SkyBlue,
    surface = CardWhite
)

private val DarkColors = darkColorScheme(
    primary = SkyBlue,
    secondary = AccentGold,
    background = InkBlue,
    surface = InkBlue
)

@Composable
fun TwStockAnalyzerTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = LightColors,
        typography = Typography,
        content = content
    )
}
