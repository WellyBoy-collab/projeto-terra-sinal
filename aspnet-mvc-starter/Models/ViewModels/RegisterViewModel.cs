using System.ComponentModel.DataAnnotations;

namespace TerraSinal.Web.Models.ViewModels;

public class RegisterViewModel
{
    [Required(ErrorMessage = "O nome completo é obrigatório.")]
    [StringLength(200, MinimumLength = 2, ErrorMessage = "O nome deve ter entre 2 e 200 caracteres.")]
    [Display(Name = "Nome completo")]
    public string FullName { get; set; } = string.Empty;

    [Required(ErrorMessage = "O email é obrigatório.")]
    [EmailAddress(ErrorMessage = "Email inválido.")]
    [Display(Name = "Email")]
    public string Email { get; set; } = string.Empty;

    [Required(ErrorMessage = "A palavra-passe é obrigatória.")]
    [StringLength(100, MinimumLength = 6, ErrorMessage = "A palavra-passe deve ter pelo menos 6 caracteres.")]
    [DataType(DataType.Password)]
    [Display(Name = "Palavra-passe")]
    public string Password { get; set; } = string.Empty;

    [Required(ErrorMessage = "Confirme a palavra-passe.")]
    [DataType(DataType.Password)]
    [Display(Name = "Confirmar palavra-passe")]
    [Compare("Password", ErrorMessage = "As palavras-passe não coincidem.")]
    public string ConfirmPassword { get; set; } = string.Empty;

    [Required(ErrorMessage = "Seleccione um perfil.")]
    [Display(Name = "Perfil")]
    public string Role { get; set; } = "Investigador";
}
