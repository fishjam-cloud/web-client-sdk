package io.fishjam.client

import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class FishjamCoreTest {
    @Test
    fun addCallsFishjamCore() {
        assertEquals(5, FishjamCore.add(2, 3))
        assertEquals(-1, FishjamCore.add(2, -3))
    }
}
