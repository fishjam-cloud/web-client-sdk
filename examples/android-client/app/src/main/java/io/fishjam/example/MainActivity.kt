package io.fishjam.example

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import io.fishjam.client.FishjamCore

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    AddScreen()
                }
            }
        }
    }
}

@Composable
fun AddScreen() {
    var first by rememberSaveable { mutableStateOf("2") }
    var second by rememberSaveable { mutableStateOf("3") }
    var result by rememberSaveable { mutableStateOf("") }

    Column(
        modifier =
        Modifier
            .fillMaxSize()
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text("Fishjam example", style = MaterialTheme.typography.headlineSmall)
        OutlinedTextField(
            value = first,
            onValueChange = { first = it },
            label = { Text("First number") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            modifier = Modifier.fillMaxWidth().testTag("first")
        )
        OutlinedTextField(
            value = second,
            onValueChange = { second = it },
            label = { Text("Second number") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            modifier = Modifier.fillMaxWidth().testTag("second")
        )
        Button(
            onClick = {
                val a = first.trim().toIntOrNull()
                val b = second.trim().toIntOrNull()
                result =
                    if (a == null || b == null) {
                        "Enter two whole numbers"
                    } else {
                        "Result: ${FishjamCore.add(a, b)}"
                    }
            },
            modifier = Modifier.fillMaxWidth().testTag("add")
        ) {
            Text("Add")
        }
        Text(result, modifier = Modifier.testTag("result"))
    }
}
