# Shutdown PC

Shut down your **Windows** and **Linux** computers from Gladys: a button on
the dashboard, a dedicated widget or a scene action ("shut the office PC
down at 11 pm", "turn everything off when I leave"…).

The integration connects to the computer over **SSH** and runs the shutdown
command. Nothing to install: the SSH server is built into Windows 10 and 11,
and available on every Linux distribution.

## 1. Prepare the computer

> Give the computer a **fixed IP address** (a DHCP reservation in your
> router): the integration reaches it at that address.

### Windows 10 / 11

Open **PowerShell as administrator** and run:

```powershell
# Install and start the SSH server, at every Windows startup too
Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0
Start-Service sshd
Set-Service -Name sshd -StartupType 'Automatic'

# Check that the firewall lets port 22 in (rule created by the install)
Get-NetFirewallRule -Name *OpenSSH-Server* | Select-Object Name, Enabled
```

Use an **administrator account** of the computer. With a Microsoft account,
the user is the name of the `C:\Users\<name>` folder and the password is the
Microsoft account password (not the PIN).

### Linux

```bash
sudo apt install openssh-server   # or your distribution's equivalent
```

Unless you use `root`, allow the chosen user (here `john`) to power the
machine off **without a password**, and nothing else:

```bash
echo "john ALL=(root) NOPASSWD: $(command -v systemctl) poweroff" | sudo tee /etc/sudoers.d/gladys-shutdown
sudo chmod 440 /etc/sudoers.d/gladys-shutdown
```

## 2. Choose the authentication

**Public key (recommended).** The integration generates its own SSH key.
Click **Show the public key** in the Configuration tab and copy the
`ssh-ed25519 … gladys-shutdown-pc` line to the computer. No password of the
computer is stored in Gladys then.

- **Windows, administrator account**: the key goes into a file shared by
  every administrator, which must be protected (PowerShell as administrator):

  ```powershell
  Add-Content -Force -Path "$env:ProgramData\ssh\administrators_authorized_keys" -Value 'ssh-ed25519 AAAA… gladys-shutdown-pc'
  icacls.exe "$env:ProgramData\ssh\administrators_authorized_keys" /inheritance:r /grant "*S-1-5-32-544:F" /grant "*S-1-5-18:F"
  ```

- **Linux**: add the line to the user's `~/.ssh/authorized_keys`.

**Password.** Just enter the account password when adding the computer. It
is stored in the integration's data volume, readable by the integration
only, and never sent back to the interface. With a password set, the key is
still tried first.

## 3. Add the computers

In the integration's **Configuration** tab:

1. **Add a computer**: name, IP address or host name, SSH port (22), user,
   system, optional password. The integration saves the computer, then tests
   the connection right away (without shutting it down) and shows the result.
2. Open the **Discovery** tab and **create** the device in a room.
3. Repeat for every computer.

Options:

- **Force applications to close** (Windows, on by default): otherwise an
  unsaved document can block the shutdown.
- **Custom command**: replaces the default command, e.g. `shutdown /h` to
  hibernate on Windows, or `sudo -n systemctl suspend` on Linux (with the
  matching sudoers rule).

The other buttons:

- **Test the connection**: connects to the chosen computer and checks the
  rights, without shutting it down. On Linux it also checks the sudoers rule.
- **Edit a computer**: enter all the values again. Leave the password empty
  to keep the current one, or tick **Remove the stored password** to switch
  to the key only. Rename the device in Gladys itself.
- **Remove a computer**: delete its device in Gladys, the integration
  forgets it at once.

The **SSH connection timeout** setting is how long to wait for a computer
(10 s by default).

## 4. Shut down

- **Dashboard**: every computer is a device with a **Shut down** button,
  shown in its room's widget.
- **"Shutdown PC" widget**: add it to a dashboard and choose the computer in
  its settings. It shows whether the computer is reachable and offers a
  **Shut down** button that asks for confirmation.
- **Scenes** (**Integrations** category): the **Shut down a computer** action
  returns `success` (true/false), which the following actions can test. The
  standard "Control devices" action on the computer's button works too.

## Security

- On the first successful connection, the integration **remembers the
  fingerprint of the computer's host key**. It then refuses to connect to a
  machine presenting another key (IP address spoofing). After reinstalling
  the computer, use **Edit a computer** to trust it again.
- Neither the passwords nor the private key ever appear in the logs.

## Troubleshooting

| Message                            | What to do                                                                                                                    |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| _no answer_                        | The computer is off or asleep, or `sshd` is not running (`Get-Service sshd`).                                                 |
| _unreachable_                      | Check the IP address, the port and the computer's firewall.                                                                   |
| _authentication refused_           | Check the user and the password, or the public key and the rights of `administrators_authorized_keys` (the `icacls` command). |
| _sudo asks for a password_         | Add the sudoers rule of step 1.                                                                                               |
| _the SSH host key changed_         | Was the computer reinstalled? Use **Edit a computer**. Otherwise, be careful.                                                 |
| _the command failed (exit code 5)_ | "Access is denied" on Windows: use an administrator account.                                                                  |

The integration logs (Gladys interface or `docker logs`) detail every
attempt.
