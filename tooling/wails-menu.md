# Menus in Wails

It is possible to add an application menu to Wails projects. This is achieved by defining a [Menu](#menu) struct and setting it in the [`Menu`](/docs/reference/options#menu) application config, or by calling the runtime method [MenuSetApplicationMenu](/docs/reference/runtime/menu#menusetapplicationmenu).

An example of how to create a menu:

```go

    app := NewApp()

    AppMenu := menu.NewMenu()
    if runtime.GOOS == "darwin" {
        AppMenu.Append(menu.AppMenu()) // On macOS platform, this must be done right after `NewMenu()`
    }
    FileMenu := AppMenu.AddSubmenu("File")
    FileMenu.AddText("&Open", keys.CmdOrCtrl("o"), func(_ *menu.CallbackData) {
        // do something
    })
    FileMenu.AddSeparator()
    FileMenu.AddText("Quit", keys.CmdOrCtrl("q"), func(_ *menu.CallbackData) {
        // `rt` is an alias of "github.com/wailsapp/wails/v2/pkg/runtime" to prevent collision with standard package
        rt.Quit(app.ctx)
    })

    if runtime.GOOS == "darwin" {
    AppMenu.Append(menu.EditMenu())  // On macOS platform, EditMenu should be appended to enable Cmd+C, Cmd+V, Cmd+Z... shortcuts
    }

    err := wails.Run(&options.App{
        Title:             "Menus Demo",
        Width:             800,
        Height:            600,
        Menu:              AppMenu, // reference the menu above
        Bind: []interface{}{
            app,
        },
    )
    // ...
```

It is also possible to dynamically update the menu, by updating the menu struct and calling [MenuUpdateApplicationMenu](/docs/reference/runtime/menu#menuupdateapplicationmenu).

The example above uses helper methods, however it's possible to build the menu structs manually.

## Menu[​](#menu "Direct link to heading")

A Menu is a collection of MenuItems:

Package: github.com/wailsapp/wails/v2/pkg/menu

```go
type Menu struct {
    Items []*MenuItem
}
```

For the Application menu, each MenuItem represents a single menu such as "Edit".

A simple helper method is provided for building menus:

Package: github.com/wailsapp/wails/v2/pkg/menu

```go
func NewMenuFromItems(first *MenuItem, rest ...*MenuItem) *Menu
```

This makes the layout of the code more like that of a menu without the need to add the menu items manually after creating them. Alternatively, you can just create the menu items and add them to the menu manually.

## MenuItem[​](#menuitem "Direct link to heading")

A MenuItem represents an item within a Menu.

Package: github.com/wailsapp/wails/v2/pkg/menu

```go
// MenuItem represents a menu item contained in a menu
type MenuItem struct {
    Label string
    Role Role
    Accelerator *keys.Accelerator
    Type Type
    Disabled bool
    Hidden bool
    Checked bool
    SubMenu *Menu
    Click Callback
}
```

| Field       | Type                               | Notes                                                         |
|-------------|------------------------------------|---------------------------------------------------------------|
| Label       | string                             | The menu text                                                 |
| Accelerator | [\*keys.Accelerator](#accelerator) | Key binding for this menu item                                |
| Type        | [Type](#type)                      | Type of MenuItem                                              |
| Disabled    | bool                               | Disables the menu item                                        |
| Hidden      | bool                               | Hides this menu item                                          |
| Checked     | bool                               | Adds check to item (Checkbox &amp; Radio types)               |
| SubMenu     | [\*Menu](#menu)                    | Sets the submenu                                              |
| Click       | [Callback](#callback)              | Callback function when menu clicked                           |
| Role        | string                             | Defines a [role](#role) for this menu item. Mac only for now. |

### Accelerator[​](#accelerator "Direct link to heading")

Accelerators (sometimes called keyboard shortcuts) define a binding between a keystroke and a menu item. Wails defines an Accelerator as a combination or key + [Modifier](#modifier). They are available in the `"github.com/wailsapp/wails/v2/pkg/menu/keys"` package.

Example:

Package: github.com/wailsapp/wails/v2/pkg/menu/keys

```go
    // Defines cmd+o on Mac and ctrl-o on Window/Linux
    myShortcut := keys.CmdOrCtrl("o")
```

Keys are any single character on a keyboard with the exception of `+`, which is defined as `plus`. Some keys cannot be represented as characters so there are a set of named characters that may be used:

|             |       |       |           |
|:-----------:|:-----:|:-----:|:---------:|
| `backspace` | `f1`  | `f16` | `f31`     |
| `tab`       | `f2`  | `f17` | `f32`     |
| `return`    | `f3`  | `f18` | `f33`     |
| `enter`     | `f4`  | `f19` | `f34`     |
| `escape`    | `f5`  | `f20` | `f35`     |
| `left`      | `f6`  | `f21` | `numlock` |
| `right`     | `f7`  | `f22` |           |
| `up`        | `f8`  | `f23` |           |
| `down`      | `f9`  | `f24` |           |
| `space`     | `f10` | `f25` |           |
| `delete`    | `f11` | `f36` |           |
| `home`      | `f12` | `f37` |           |
| `end`       | `f13` | `f38` |           |
| `page up`   | `f14` | `f39` |           |
| `page down` | `f15` | `f30` |           |

Wails also supports parsing accelerators using the same syntax as Electron. This is useful for storing accelerators in config files.

Example:

Package: github.com/wailsapp/wails/v2/pkg/menu/keys

```go
    // Defines cmd+o on Mac and ctrl-o on Window/Linux
    myShortcut, err := keys.Parse("Ctrl+Option+A")
```

#### Modifier[​](#modifier "Direct link to heading")

The following modifiers are keys that may be used in combination with the accelerator key:

Package: github.com/wailsapp/wails/v2/pkg/menu/keys

```go
const (
    // CmdOrCtrlKey represents Command on Mac and Control on other platforms
    CmdOrCtrlKey Modifier = "cmdorctrl"
    // OptionOrAltKey represents Option on Mac and Alt on other platforms
    OptionOrAltKey Modifier = "optionoralt"
    // ShiftKey represents the shift key on all systems
    ShiftKey Modifier = "shift"
    // ControlKey represents the control key on all systems
    ControlKey Modifier = "ctrl"
)
```

A number of helper methods are available to create Accelerators using modifiers:

Package: github.com/wailsapp/wails/v2/pkg/menu/keys

```go
func CmdOrCtrl(key string) *Accelerator
func OptionOrAlt(key string) *Accelerator
func Shift(key string) *Accelerator
func Control(key string) *Accelerator
```

Modifiers can be combined using `keys.Combo(key string, modifier1 Modifier, modifier2 Modifier, rest ...Modifier)`:

Package: github.com/wailsapp/wails/v2/pkg/menu/keys

```go
    // Defines "Ctrl+Option+A" on Mac and "Ctrl+Alt+A" on Window/Linux
    myShortcut := keys.Combo("a", ControlKey, OptionOrAltKey)
```

### Type[​](#type "Direct link to heading")

Each menu item must have a type and there are 5 types available:

Package: github.com/wailsapp/wails/v2/pkg/menu

```go
const (
    TextType Type = "Text"
    SeparatorType Type = "Separator"
    SubmenuType Type = "Submenu"
    CheckboxType Type = "Checkbox"
    RadioType Type = "Radio"
)
```

For convenience, helper methods are provided to quickly create a menu item:

Package: github.com/wailsapp/wails/v2/pkg/menu

```go
func Text(label string, accelerator *keys.Accelerator, click Callback) *MenuItem
func Separator() *MenuItem
func Radio(label string, selected bool, accelerator *keys.Accelerator, click Callback) *MenuItem
func Checkbox(label string, checked bool, accelerator *keys.Accelerator, click Callback) *MenuItem
func SubMenu(label string, menu *Menu) *Menu
```

You can also create menu items directly on a menu by using the "Add" helpers:

Package: github.com/wailsapp/wails/v2/pkg/menu

```go
func (m *Menu) AddText(label string, accelerator *keys.Accelerator, click Callback) *MenuItem
func (m *Menu) AddSeparator() *MenuItem
func (m *Menu) AddRadio(label string, selected bool, accelerator *keys.Accelerator, click Callback) *MenuItem
func (m *Menu) AddCheckbox(label string, checked bool, accelerator *keys.Accelerator, click Callback) *MenuItem
func (m *Menu) AddSubMenu(label string, menu *Menu) *MenuI
```

A note on radio groups: A radio group is defined as a number of radio menu items that are next to each other in the menu. This means that you do not need to group items together as it is automatic. However, that also means you cannot have 2 radio groups next to each other - there must be a non-radio item between them.

### Callback[​](#callback "Direct link to heading")

Each menu item may have a callback that is executed when the item is clicked:

Package: github.com/wailsapp/wails/v2/pkg/menu

```go
type Callback func(*CallbackData)

type CallbackData struct {
    MenuItem    *MenuItem
}
```

The function is given a `CallbackData` struct which indicates which menu item triggered the callback. This is useful when using radio groups that may share a callback.

### Role[​](#role "Direct link to heading")

Roles

Roles are currently supported on Mac only.

A menu item may have a role, which is essentially a pre-defined menu item. We currently support the following roles:

| Role         | Description                                                              |
|--------------|--------------------------------------------------------------------------|
| AppMenuRole  | The standard Mac application menu. Can be created using `menu.AppMenu()` |
| EditMenuRole | The standard Mac edit menu. Can be created using `menu.EditMenu()`       |
