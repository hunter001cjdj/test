package com.example.twstockanalyzer

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.example.twstockanalyzer.ui.theme.TwStockAnalyzerTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            TwStockAnalyzerTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    AnalyzerApp()
                }
            }
        }
    }
}

private enum class RiskRewardType(val label: String) {
    ALL("全部"),
    HIGH_RISK_HIGH_REWARD("高風險高報酬"),
    LOW_RISK_HIGH_REWARD("低風險高報酬"),
    HIGH_RISK_LOW_REWARD("高風險低報酬"),
    LOW_RISK_LOW_REWARD("低風險低報酬")
}

private data class StockInsight(
    val stockId: String,
    val stockName: String,
    val price: String,
    val change: String,
    val stars: Int,
    val riskRewardType: RiskRewardType,
    val recommendReasons: List<String>,
    val avoidReasons: List<String>
)

private val sampleStocks = listOf(
    StockInsight(
        stockId = "2330",
        stockName = "台積電",
        price = "NT$ 968",
        change = "+1.82%",
        stars = 5,
        riskRewardType = RiskRewardType.LOW_RISK_HIGH_REWARD,
        recommendReasons = listOf("獲利能力強", "產業趨勢長期成長", "ROE 維持高檔"),
        avoidReasons = listOf("短線漲幅較大，追價要小心")
    ),
    StockInsight(
        stockId = "3661",
        stockName = "世芯-KY",
        price = "NT$ 2,645",
        change = "+4.11%",
        stars = 4,
        riskRewardType = RiskRewardType.HIGH_RISK_HIGH_REWARD,
        recommendReasons = listOf("高成長題材", "營收動能強"),
        avoidReasons = listOf("波動大", "估值偏高")
    ),
    StockInsight(
        stockId = "1301",
        stockName = "台塑",
        price = "NT$ 61.2",
        change = "-0.48%",
        stars = 2,
        riskRewardType = RiskRewardType.LOW_RISK_LOW_REWARD,
        recommendReasons = listOf("相對穩定", "防禦型標的"),
        avoidReasons = listOf("成長動能不足", "報酬爆發力有限")
    )
)

@Composable
private fun AnalyzerApp() {
    var selectedType by rememberSaveable { mutableStateOf(RiskRewardType.ALL) }

    val visibleStocks = sampleStocks.filter {
        selectedType == RiskRewardType.ALL || it.riskRewardType == selectedType
    }

    Scaffold { innerPadding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            item {
                HeaderSection()
            }

            item {
                FilterSection(
                    selectedType = selectedType,
                    onSelect = { selectedType = it }
                )
            }

            items(visibleStocks) { stock ->
                StockCard(stock = stock)
            }
        }
    }
}

@Composable
private fun HeaderSection() {
    Column {
        Text(
            text = "TW Stock Analyzer",
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.Bold
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = "即時台股分析、四象限風險報酬分類、1 到 5 星推薦指數與推薦原因輸出。",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
private fun FilterSection(
    selectedType: RiskRewardType,
    onSelect: (RiskRewardType) -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(
            text = "風險 / 報酬分類",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            RiskRewardType.entries.take(3).forEach { type ->
                FilterChip(
                    selected = selectedType == type,
                    onClick = { onSelect(type) },
                    label = { Text(type.label) }
                )
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            RiskRewardType.entries.drop(3).forEach { type ->
                FilterChip(
                    selected = selectedType == type,
                    onClick = { onSelect(type) },
                    label = { Text(type.label) }
                )
            }
        }
    }
}

@Composable
private fun StockCard(stock: StockInsight) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        shape = RoundedCornerShape(20.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = "${stock.stockName} (${stock.stockId})",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = stock.price,
                        style = MaterialTheme.typography.bodyLarge
                    )
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text(
                        text = stock.change,
                        color = if (stock.change.startsWith("+")) Color(0xFFCF3D2E) else Color(0xFF1D8A5B),
                        fontWeight = FontWeight.SemiBold
                    )
                    Text(text = "推薦 ${"★".repeat(stock.stars)}")
                }
            }

            Tag(stock.riskRewardType.label)
            ReasonBlock(title = "推薦原因", reasons = stock.recommendReasons)
            ReasonBlock(title = "不推薦原因", reasons = stock.avoidReasons)
        }
    }
}

@Composable
private fun Tag(text: String) {
    Box(
        modifier = Modifier
            .background(Color(0xFFE7F2FF), RoundedCornerShape(999.dp))
            .padding(horizontal = 12.dp, vertical = 8.dp)
    ) {
        Text(
            text = text,
            color = Color(0xFF1B5FA7),
            fontWeight = FontWeight.SemiBold
        )
    }
}

@Composable
private fun ReasonBlock(title: String, reasons: List<String>) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(
            text = title,
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold
        )
        reasons.forEach { reason ->
            Row(verticalAlignment = Alignment.Top) {
                Text(text = "•")
                Spacer(modifier = Modifier.width(8.dp))
                Text(text = reason, style = MaterialTheme.typography.bodyMedium)
            }
        }
    }
}
