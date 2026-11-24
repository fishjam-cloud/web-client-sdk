package io.fishjam.client.voip

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.telecom.DisconnectCause
import android.text.TextUtils
import android.view.Gravity
import android.view.MotionEvent
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.Button
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.Space
import android.widget.TextView
import androidx.annotation.RequiresApi
import androidx.core.content.ContextCompat
import androidx.core.graphics.ColorUtils
import kotlin.math.abs

/**
 * Full-screen incoming-call screen shown over the lock screen via the
 * notification's full-screen intent. Built programmatically so the library
 * carries no layout resources.
 *
 * Two entry modes:
 *  - launched with [ACTION_ANSWER] (the notification's Answer button): answers
 *    immediately, brings the host app forward, and shows a minimal
 *    "Connecting..." view until the host activity covers it.
 *  - launched without an action (full-screen intent): draws the ring UI with
 *    Answer/Decline buttons.
 *
 * Auto-dismisses when the call ends elsewhere via the [ACTION_CALL_ENDED]
 * broadcast that [CallManager] sends when its call tears down.
 */
@RequiresApi(Build.VERSION_CODES.O)
class IncomingCallActivity : Activity() {
    companion object {
        const val ACTION_ANSWER = "fishjam.voip.ACTION_ANSWER"
        const val ACTION_SHOW_WAITING = "fishjam.voip.ACTION_SHOW_WAITING"

        /** Shows the in-call screen (outgoing, or after the call is answered) and keeps it up. */
        const val ACTION_SHOW_ONGOING = "fishjam.voip.ACTION_SHOW_ONGOING"

        /** The call is connected. The in-call screen switches from "Connecting…" to "Ongoing call". */
        const val ACTION_CALL_ACTIVE = "fishjam.voip.ACTION_CALL_ACTIVE"
        const val ACTION_CALL_ENDED = "fishjam.voip.ACTION_CALL_ENDED"

        /**
         * Distinct from [ACTION_CALL_ENDED], which is about the
         * current call and must not dismiss the waiting screen.
         */
        const val ACTION_WAITING_ENDED = "fishjam.voip.ACTION_WAITING_ENDED"

        /** Broadcast by [CallManager] once the caller avatar has downloaded. */
        const val ACTION_AVATAR_READY = "fishjam.voip.ACTION_AVATAR_READY"

        /** Fraction of max travel the knob must cross to trigger the action. */
        private const val SWIPE_TRIGGER = 0.7f

        /** Max handset tilt (degrees) at full travel; negative = toward Decline. */
        private const val ICON_MAX_TILT = 35f

        /** How much the non-target label fades at full travel (0..1). */
        private const val LABEL_FADE = 0.75f

        /** How far (dp) the target label slides outward at full travel. */
        private const val LABEL_SHIFT_DP = 10
    }

    // Closes use finishAndRemoveTask(), not finish(). finish() left the call's task in
    // Recents after the call ended, so the call screen stayed in the app switcher.
    private val callEndedReceiver =
        object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) {
                when (intent.action) {
                    ACTION_CALL_ENDED -> if (!isWaitingCall) finishAndRemoveTask()
                    ACTION_WAITING_ENDED -> if (isWaitingCall) finishAndRemoveTask()
                    ACTION_AVATAR_READY -> refreshAvatar()
                    ACTION_CALL_ACTIVE -> if (showingCall) showInCallScreen()
                }
            }
        }
    private var callEndedReceiverRegistered = false
    private var isAnswering = false
    private var isWaitingCall = false

    /** In-call screen stays up for the whole call. The ringing screen closes once the call is answered. */
    private var showingCall = false

    /** The hero avatar container, so a late-arriving photo can replace the initials. */
    private var avatarHolder: FrameLayout? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        configureWindowForLockScreen()

        if (intent?.action == ACTION_ANSWER) {
            answerAndOpenApp()
            return
        }

        if (intent?.action == ACTION_SHOW_ONGOING) {
            showInCallScreen()
            return
        }

        if (intent?.action == ACTION_SHOW_WAITING) {
            if (!CallManager.hasWaitingCall()) {
                finishAndRemoveTask()
                return
            }
            isWaitingCall = true
            setContentView(
                buildWaitingUi(
                    CallManager.waitingDisplayName(),
                    CallManager.waitingIsVideo()
                )
            )
            registerCallEndedReceiver()
            return
        }

        if (!CallManager.hasActiveCall()) {
            finishAndRemoveTask()
            return
        }

        setContentView(buildUi(CallManager.currentDisplayName(), CallManager.currentIsVideo()))
        registerCallEndedReceiver()
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        if (intent?.action == ACTION_ANSWER) answerAndOpenApp()
        if (intent?.action == ACTION_SHOW_ONGOING) showInCallScreen()
    }

    override fun onDestroy() {
        if (callEndedReceiverRegistered) unregisterReceiver(callEndedReceiver)
        super.onDestroy()
    }

    private fun answerAndOpenApp() {
        // Reachable from both the swipe gesture and repeated ACTION_ANSWER
        // intents (onCreate + onNewIntent); only the first one may run.
        if (isAnswering) return
        isAnswering = true

        CallManager.answer()
        // Register the lifecycle hook before launching, so the host activity
        // is flagged in onActivityCreated even on the fastest cold start.
        LockScreenController.onCallAnswered(applicationContext)
        // The host app joins the room from behind this screen.
        packageManager.getLaunchIntentForPackage(packageName)?.let {
            it.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
            it.putExtra(LockScreenController.VOIP_ANSWER, true)
            startActivity(it)
        }
        showInCallScreen()
        bringCallScreenToFront()
    }

    /** Name, status, and End. Stays visible for the whole call, including from the app switcher. */
    private fun showInCallScreen() {
        if (!CallManager.hasActiveCall()) {
            finishAndRemoveTask()
            return
        }
        showingCall = true
        val status = if (CallManager.isConnected()) "Ongoing call" else "Connecting…"
        setContentView(buildInCallUi(CallManager.currentDisplayName(), status))
        registerCallEndedReceiver()
    }

    private fun bringCallScreenToFront() {
        val front =
            Intent(this, IncomingCallActivity::class.java).apply {
                action = ACTION_SHOW_ONGOING
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
            }
        startActivity(front)
    }

    override fun onStop() {
        super.onStop()
        // The ringing screen closes once something else covers it after an answer.
        // The in-call screen stays, so it can be brought back from the notification.
        if (showingCall) return
        if (isAnswering || CallManager.isAnswered()) finishAndRemoveTask()
    }

    private fun registerCallEndedReceiver() {
        if (callEndedReceiverRegistered) return
        callEndedReceiverRegistered = true
        ContextCompat.registerReceiver(
            this,
            callEndedReceiver,
            IntentFilter(ACTION_CALL_ENDED).apply {
                addAction(ACTION_WAITING_ENDED)
                addAction(ACTION_AVATAR_READY)
                addAction(ACTION_CALL_ACTIVE)
            },
            ContextCompat.RECEIVER_NOT_EXPORTED
        )
    }

    @Suppress("DEPRECATION")
    private fun configureWindowForLockScreen() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        }
        window.addFlags(
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
        )
    }

    // Pixel-dialer-inspired palette.
    private val backgroundDark = Color.parseColor("#121316")
    private val avatarGreen = Color.parseColor("#1B6B50")
    private val answerGreen = Color.parseColor("#1E8E3E")
    private val declineRed = Color.parseColor("#DC362E")
    private val barGray = Color.parseColor("#2B2D31")
    private val textPrimary = Color.parseColor("#E9EBEE")
    private val textSecondary = Color.parseColor("#C4C7CC")

    private fun buildUi(displayName: String, isVideo: Boolean): ViewGroup {
        val name = displayName.ifBlank { "Unknown" }

        val root =
            LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER_HORIZONTAL
                setBackgroundColor(backgroundDark)
                layoutParams =
                    ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                    )
                setPadding(0, dp(56), 0, dp(40))
            }

        root.addView(
            TextView(this).apply {
                text = if (isVideo) "Incoming video call" else "Incoming voice call"
                setTextColor(textSecondary)
                textSize = 16f
                gravity = Gravity.CENTER
            }
        )

        // Big caller name; marquee-scrolls when it overflows, like the dialer.
        root.addView(
            TextView(this).apply {
                text = name
                setTextColor(textPrimary)
                textSize = 38f
                gravity = Gravity.CENTER
                isSingleLine = true
                ellipsize = TextUtils.TruncateAt.MARQUEE
                marqueeRepeatLimit = -1
                isSelected = true
                setPadding(0, dp(6), 0, 0)
                layoutParams =
                    LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT,
                        LinearLayout.LayoutParams.WRAP_CONTENT
                    )
            }
        )

        root.addView(Space(this), weight(1f))

        // Large centered avatar (the audio-call variant's hero element).
        root.addView(avatarView(name, sizeDp = 180, textSizeSp = 72f))

        root.addView(Space(this), weight(1f))

        root.addView(buildSwipeBar())

        return root
    }

    private fun buildWaitingUi(displayName: String, isVideo: Boolean): ViewGroup {
        val root = buildUi(displayName, isVideo)
        root.post {
            if (!CallManager.hasWaitingCall()) finishAndRemoveTask()
        }
        return root
    }

    /** In-call screen: who, whether it is still connecting, and End. */
    private fun buildInCallUi(displayName: String, status: String): ViewGroup {
        val name = displayName.ifBlank { "Unknown" }

        val root =
            LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER
                setBackgroundColor(backgroundDark)
                layoutParams =
                    ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                    )
            }

        root.addView(avatarView(name, sizeDp = 120, textSizeSp = 48f))

        root.addView(
            TextView(this).apply {
                text = name
                setTextColor(textPrimary)
                textSize = 26f
                gravity = Gravity.CENTER
                setPadding(0, dp(20), 0, 0)
            }
        )

        root.addView(
            TextView(this).apply {
                text = status
                setTextColor(textSecondary)
                textSize = 16f
                gravity = Gravity.CENTER
                setPadding(0, dp(8), 0, 0)
            }
        )

        root.addView(
            Button(this).apply {
                text = "End"
                setTextColor(Color.WHITE)
                setBackgroundColor(declineRed)
                setOnClickListener {
                    CallManager.endCall(DisconnectCause(DisconnectCause.LOCAL))
                }
                layoutParams =
                    LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT,
                        dp(56)
                    ).apply {
                        topMargin = dp(48)
                        marginStart = dp(48)
                        marginEnd = dp(48)
                    }
            }
        )

        return root
    }

    /**
     * The bottom pill: "Decline" on the left, "Answer" on the right, and a white
     * knob with a green phone icon in the middle. Drag the knob right to answer
     * (tints green) or left to decline (tints red); release short of the
     * threshold and it springs back.
     */
    private fun buildSwipeBar(): FrameLayout {
        val bar =
            FrameLayout(this).apply {
                background = pill(barGray, radiusDp = 48)
                layoutParams =
                    LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT,
                        dp(96)
                    ).apply {
                        marginStart = dp(20)
                        marginEnd = dp(20)
                    }
            }

        val declineLabel =
            TextView(this).apply {
                text = "Decline"
                setTextColor(textPrimary)
                textSize = 17f
                layoutParams =
                    FrameLayout.LayoutParams(
                        FrameLayout.LayoutParams.WRAP_CONTENT,
                        FrameLayout.LayoutParams.WRAP_CONTENT,
                        Gravity.START or Gravity.CENTER_VERTICAL
                    ).apply { marginStart = dp(32) }
            }
        bar.addView(declineLabel)

        val answerLabel =
            TextView(this).apply {
                text = "Answer"
                setTextColor(textPrimary)
                textSize = 17f
                layoutParams =
                    FrameLayout.LayoutParams(
                        FrameLayout.LayoutParams.WRAP_CONTENT,
                        FrameLayout.LayoutParams.WRAP_CONTENT,
                        Gravity.END or Gravity.CENTER_VERTICAL
                    ).apply { marginEnd = dp(32) }
            }
        bar.addView(answerLabel)

        val icon =
            ImageView(this).apply {
                setImageResource(android.R.drawable.sym_action_call)
                setColorFilter(answerGreen)
                layoutParams =
                    FrameLayout.LayoutParams(dp(30), dp(30), Gravity.CENTER)
            }
        val knobBackground = pill(Color.WHITE, radiusDp = 36)
        val knob =
            FrameLayout(this).apply {
                background = knobBackground
                contentDescription = "Swipe right to answer, left to decline"
                layoutParams = FrameLayout.LayoutParams(dp(120), dp(72), Gravity.CENTER)
                addView(icon)
            }
        bar.addView(knob)

        attachSwipe(bar, knob, knobBackground, icon, declineLabel, answerLabel)
        return bar
    }

    private fun attachSwipe(
        bar: FrameLayout,
        knob: FrameLayout,
        knobBackground: GradientDrawable,
        icon: ImageView,
        declineLabel: TextView,
        answerLabel: TextView
    ) {
        var downX = 0f

        // fraction is signed, in [-1, 1]; negative = dragging toward Decline.
        fun applyDragVisuals(fraction: Float) {
            val magnitude = abs(fraction)
            val target = if (fraction >= 0) answerGreen else declineRed

            knobBackground.setColor(ColorUtils.blendARGB(Color.WHITE, target, magnitude))
            icon.setColorFilter(ColorUtils.blendARGB(answerGreen, Color.WHITE, magnitude))
            // Tilt the handset with the drag (hang-up tilt toward Decline).
            icon.rotation = fraction * ICON_MAX_TILT

            if (fraction < 0) {
                // Toward Decline: its label reddens and slides out; Answer fades.
                declineLabel.setTextColor(
                    ColorUtils.blendARGB(textPrimary, declineRed, magnitude)
                )
                declineLabel.translationX = -dp(LABEL_SHIFT_DP) * magnitude
                declineLabel.alpha = 1f
                answerLabel.setTextColor(textPrimary)
                answerLabel.translationX = 0f
                answerLabel.alpha = 1f - LABEL_FADE * magnitude
            } else {
                // Toward Answer: its label greens and slides out; Decline fades.
                answerLabel.setTextColor(
                    ColorUtils.blendARGB(textPrimary, answerGreen, magnitude)
                )
                answerLabel.translationX = dp(LABEL_SHIFT_DP) * magnitude
                answerLabel.alpha = 1f
                declineLabel.setTextColor(textPrimary)
                declineLabel.translationX = 0f
                declineLabel.alpha = 1f - LABEL_FADE * magnitude
            }
        }

        fun resetVisuals() {
            knob.animate().translationX(0f).setDuration(150).start()
            icon.animate().rotation(0f).setDuration(150).start()
            knobBackground.setColor(Color.WHITE)
            icon.setColorFilter(answerGreen)
            for (label in listOf(declineLabel, answerLabel)) {
                label.animate().translationX(0f).alpha(1f).setDuration(150).start()
                label.setTextColor(textPrimary)
            }
        }

        knob.setOnTouchListener { view, event ->
            val maxTravel = (bar.width - knob.width) / 2f - dp(12)
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    downX = event.rawX
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    if (maxTravel <= 0f) return@setOnTouchListener true
                    val dx = (event.rawX - downX).coerceIn(-maxTravel, maxTravel)
                    knob.translationX = dx
                    applyDragVisuals(dx / maxTravel)
                    true
                }
                MotionEvent.ACTION_UP -> {
                    view.performClick()
                    val fraction =
                        if (maxTravel > 0f) knob.translationX / maxTravel else 0f
                    when {
                        fraction >= SWIPE_TRIGGER -> {
                            if (isWaitingCall) {
                                CallManager.acceptWaitingCall(this@IncomingCallActivity)
                            } else {
                                answerAndOpenApp()
                            }
                            finishAndRemoveTask()
                        }
                        fraction <= -SWIPE_TRIGGER -> {
                            if (isWaitingCall) {
                                CallManager.declineWaitingCall(this@IncomingCallActivity)
                            } else {
                                CallManager.endCall(DisconnectCause(DisconnectCause.REJECTED))
                            }
                            finishAndRemoveTask()
                        }
                        else -> resetVisuals()
                    }
                    true
                }
                MotionEvent.ACTION_CANCEL -> {
                    resetVisuals()
                    true
                }
                else -> false
            }
        }
    }

    /**
     * The hero avatar: shows the downloaded caller photo if available, otherwise
     * an initials circle. Returned as a holder so [refreshAvatar] can swap in a
     * photo that lands after the screen is already showing.
     */
    private fun activeAvatarBitmap(): Bitmap? =
        if (isWaitingCall) CallManager.currentWaitingAvatarBitmap() else CallManager.currentAvatarBitmap()

    private fun avatarView(name: String, sizeDp: Int, textSizeSp: Float): FrameLayout {
        val holder = FrameLayout(this).apply {
            layoutParams = LinearLayout.LayoutParams(dp(sizeDp), dp(sizeDp))
        }
        val bitmap = activeAvatarBitmap()
        holder.addView(if (bitmap != null) avatarImage(bitmap) else initialsAvatar(name, textSizeSp))
        avatarHolder = holder
        return holder
    }

    private fun initialsAvatar(name: String, textSizeSp: Float): TextView = TextView(this).apply {
        text = name.firstOrNull()?.uppercase() ?: "?"
        setTextColor(Color.WHITE)
        textSize = textSizeSp
        gravity = Gravity.CENTER
        background =
            GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(avatarGreen)
            }
        layoutParams = FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        )
    }

    /** The already circular-cropped caller photo, sized to fill the holder. */
    private fun avatarImage(bitmap: Bitmap): ImageView = ImageView(this).apply {
        setImageBitmap(bitmap)
        scaleType = ImageView.ScaleType.FIT_CENTER
        layoutParams = FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        )
    }

    /** Replaces the initials circle with the caller photo once it has downloaded. */
    private fun refreshAvatar() {
        val holder = avatarHolder ?: return
        val bitmap = activeAvatarBitmap() ?: return
        holder.removeAllViews()
        holder.addView(avatarImage(bitmap))
    }

    private fun pill(color: Int, radiusDp: Int): GradientDrawable = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        cornerRadius = dp(radiusDp).toFloat()
        setColor(color)
    }

    private fun weight(value: Float): LinearLayout.LayoutParams =
        LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, value)

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()
}
